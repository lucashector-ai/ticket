"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import {
  bankCredential, bankPendingUserId, bankUserId, checkBankPassword, closeBankSession, destLabel, hasDestination, hashBankPassword,
  MIN_PAYOUT, openBankSession, ownerByEmail, setBankPending, walletFor,
} from "@/lib/bank";
import { getPainelScope } from "@/lib/data/painel";
import { brl } from "@/lib/format";
import { checkCode, issueCode, logSecurity, maskEmail } from "@/lib/mfa";
import { mailPayoutRequested, mailSecurityNotice, userContact } from "@/lib/notify";
import { HUMAN_ERROR, verifyHuman } from "@/lib/turnstile";

type R = { ok: boolean; error?: string };
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const WRONG = "E-mail ou senha do banco incorretos.";

/** 1ª etapa: e-mail + senha do banco. Certo, manda o código por e-mail. */
export async function bankLogin(email: string, password: string, human: string): Promise<R & { to?: string }> {
  if (!(await verifyHuman(human))) return { ok: false, error: HUMAN_ERROR };
  const e = z.string().email().safeParse(email.trim().toLowerCase());
  if (!e.success || !password) return { ok: false, error: WRONG };
  const owner = await ownerByEmail(e.data);
  const cred = owner ? await bankCredential(owner.id) : null;
  if (!owner || !cred) return { ok: false, error: WRONG };
  if (cred.lockedUntil && cred.lockedUntil > new Date()) {
    const min = Math.ceil((cred.lockedUntil.getTime() - Date.now()) / 60e3);
    return { ok: false, error: `Muitas tentativas erradas. Tente de novo em ${min} min.` };
  }
  if (!(await checkBankPassword(password, cred.passwordHash))) {
    const failed = cred.failed + 1;
    await db.update(schema.bankCredentials).set({ failed: failed >= MAX_FAILS ? 0 : failed, lockedUntil: failed >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60e3) : null }).where(eq(schema.bankCredentials.userId, owner.id));
    if (failed >= MAX_FAILS) {
      await logSecurity(owner.id, "bank", "Banco bloqueado por senha errada");
      after(() => mailSecurityNotice(owner.email, "Banco Tickets Win bloqueado por 15 minutos", "Alguém errou a senha do Banco Tickets Win várias vezes seguidas. Bloqueamos o acesso por 15 minutos. Se não foi você, troque a senha do banco no painel."));
      return { ok: false, error: `Senha errada ${MAX_FAILS} vezes. O banco ficou bloqueado por ${LOCK_MIN} minutos.` };
    }
    return { ok: false, error: WRONG };
  }
  await db.update(schema.bankCredentials).set({ failed: 0, lockedUntil: null }).where(eq(schema.bankCredentials.userId, owner.id));
  const sent = await issueCode(owner.id, "bank", "email", owner.email, owner.name);
  if (!sent.ok) return sent;
  await setBankPending(owner.id);
  return { ok: true, to: maskEmail(owner.email) };
}

export async function bankResend(): Promise<R> {
  const userId = await bankPendingUserId();
  if (!userId) return { ok: false, error: "Digite a senha de novo." };
  const c = await userContact(userId);
  if (!c) return { ok: false, error: "Conta não encontrada." };
  return issueCode(userId, "bank", "email", c.email, c.name);
}

/** 2ª etapa: código do e-mail. Abre a sessão do banco por 30 minutos. */
export async function bankVerify(code: string): Promise<R> {
  const userId = await bankPendingUserId();
  if (!userId) return { ok: false, error: "O tempo acabou. Digite a senha de novo." };
  const r = await checkCode(userId, "bank", code);
  if (!r.ok) return r;
  await openBankSession(userId);
  await logSecurity(userId, "bank", "Entrada no Banco Tickets Win");
  return { ok: true };
}

export async function bankLogout() {
  await closeBankSession();
}

/** Pede um saque do saldo disponível para a conta cadastrada no painel. */
export async function requestPayout(amountCents: number): Promise<R> {
  const userId = await bankUserId();
  if (!userId) return { ok: false, error: "Sua sessão do banco expirou. Entre de novo." };
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount < MIN_PAYOUT) return { ok: false, error: `O saque mínimo é ${brl(MIN_PAYOUT)}.` };
  const w = await walletFor(userId);
  if (!w) return { ok: false, error: "Só o dono dos eventos pode sacar." };
  if (!hasDestination(w.destination)) return { ok: false, error: "Cadastre a conta para receber em Painel → Configurações → Recebimento." };
  if (amount > w.available) return { ok: false, error: `Você pode sacar até ${brl(w.available)}.` };
  const [row] = await db.insert(schema.payoutRequests).values({ userId, organizerId: w.org?.id ?? null, amountCents: amount, destination: w.destination }).returning({ id: schema.payoutRequests.id });
  await logSecurity(userId, "payout", `Saque de ${brl(amount)} pedido`);
  const c = await userContact(userId);
  if (c) after(() => mailPayoutRequested(c.email, c.name, amount, destLabel(w.destination), row.id));
  revalidatePath("/banco");
  return { ok: true };
}

/** Cancela um saque que ainda não começou a ser processado. */
export async function cancelPayout(id: string): Promise<R> {
  const userId = await bankUserId();
  if (!userId) return { ok: false, error: "Sua sessão do banco expirou. Entre de novo." };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Saque não encontrado." };
  const r = await db.update(schema.payoutRequests).set({ status: "cancelled" })
    .where(and(eq(schema.payoutRequests.id, id), eq(schema.payoutRequests.userId, userId), eq(schema.payoutRequests.status, "requested")))
    .returning({ id: schema.payoutRequests.id });
  if (!r.length) return { ok: false, error: "Este saque já está sendo processado e não pode mais ser cancelado." };
  await logSecurity(userId, "payout", "Saque cancelado");
  revalidatePath("/banco");
  return { ok: true };
}

/** No painel (logado no site): cria ou troca a senha do banco. Só o dono dos eventos. */
export async function setBankPassword(password: string): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const scope = await getPainelScope(user);
  if (scope.role !== "owner") return { ok: false, error: "Só o dono dos eventos tem acesso ao banco." };
  if (password.length < 8) return { ok: false, error: "A senha do banco precisa ter pelo menos 8 caracteres." };
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) return { ok: false, error: "Use letras e números na senha do banco." };
  const passwordHash = await hashBankPassword(password);
  const had = !!(await bankCredential(user.id));
  await db.insert(schema.bankCredentials).values({ userId: user.id, passwordHash }).onConflictDoUpdate({ target: schema.bankCredentials.userId, set: { passwordHash, failed: 0, lockedUntil: null } });
  await logSecurity(user.id, "bank", had ? "Senha do banco trocada" : "Senha do banco criada");
  after(() => mailSecurityNotice(user.email, had ? "A senha do Banco Tickets Win mudou" : "Banco Tickets Win liberado", had ? "A senha do Banco Tickets Win da sua conta acabou de ser trocada pelo painel." : "Você criou a senha do Banco Tickets Win. Use seu e-mail e essa senha para ver o extrato e pedir saques."));
  revalidatePath("/painel/financeiro");
  return { ok: true };
}
