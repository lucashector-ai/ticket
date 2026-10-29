"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  bankCredential, bankPendingUserId, bankSetup, bankUserId, checkBankPassword, clearBankSetup, closeBankSession, destLabel, hasDestination,
  hashBankPassword, MIN_PAYOUT, openBankSession, ownerByEmail, setBankPending, setBankSetup, walletFor,
} from "@/lib/bank";
import { getPainelScope } from "@/lib/data/painel";
import { brl } from "@/lib/format";
import { checkCode, checkSecondFactor, issueCode, logSecurity, maskEmail, mfaSettings } from "@/lib/mfa";
import { mailPayoutRequested, mailSecurityNotice, userContact } from "@/lib/notify";
import { HUMAN_ERROR, verifyHuman } from "@/lib/turnstile";

/*
 * Banco Tickets Win: só o dono dos eventos, só com app autenticador.
 * Entrar = e-mail + senha do banco + código do app. Sacar pede o código do app de novo.
 * Criar ou recuperar a senha do banco = código no e-mail → código do app → senha nova.
 */

type R = { ok: boolean; error?: string };
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const WRONG = "E-mail ou senha do banco incorretos.";
const NEED_APP = "O banco exige o app autenticador. Ative em Minha conta → Privacidade e segurança e volte aqui.";

/** Dono de eventos (e só ele) com o app autenticador cadastrado? */
async function ownerReady(userId: string) {
  const [scope, mfa] = await Promise.all([getPainelScope({ id: userId }), mfaSettings(userId)]);
  return { owner: scope.role === "owner" && scope.events.length > 0, totp: mfa.method === "totp" };
}

/* ============================== entrar ============================== */

/** 1ª etapa: e-mail + senha do banco. Certo, pede o código do app. */
export async function bankLogin(email: string, password: string, human: string): Promise<R> {
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
      after(() => mailSecurityNotice(owner.email, "Banco Tickets Win bloqueado por 15 minutos", "Alguém errou a senha do Banco Tickets Win várias vezes seguidas. Bloqueamos o acesso por 15 minutos. Se não foi você, recrie a senha do banco em “Criar ou recuperar acesso”."));
      return { ok: false, error: `Senha errada ${MAX_FAILS} vezes. O banco ficou bloqueado por ${LOCK_MIN} minutos.` };
    }
    return { ok: false, error: WRONG };
  }
  await db.update(schema.bankCredentials).set({ failed: 0, lockedUntil: null }).where(eq(schema.bankCredentials.userId, owner.id));
  const ready = await ownerReady(owner.id);
  if (!ready.owner) return { ok: false, error: "Só o dono dos eventos tem acesso ao banco." };
  if (!ready.totp) return { ok: false, error: NEED_APP };
  await setBankPending(owner.id);
  return { ok: true };
}

/** 2ª etapa: código do app autenticador (código de recuperação não vale no banco). Abre a sessão por 30 minutos. */
export async function bankVerify(code: string): Promise<R> {
  const userId = await bankPendingUserId();
  if (!userId) return { ok: false, error: "O tempo acabou. Digite a senha de novo." };
  if (/[a-z]/i.test(code)) return { ok: false, error: "Use o código do app autenticador." };
  const r = await checkSecondFactor(userId, "bank", code);
  if (!r.ok) return r;
  if (r.how !== "totp") return { ok: false, error: NEED_APP };
  await openBankSession(userId);
  await logSecurity(userId, "bank", "Entrada no Banco Tickets Win");
  return { ok: true };
}

export async function bankLogout() {
  await closeBankSession();
}

/* ============================== criar ou recuperar o acesso ============================== */

/** Passo 1: código no e-mail. A resposta é a mesma exista ou não a conta (não revela quem é produtor). */
export async function bankSetupStart(email: string, human: string): Promise<R & { to?: string }> {
  if (!(await verifyHuman(human))) return { ok: false, error: HUMAN_ERROR };
  const e = z.string().email().safeParse(email.trim().toLowerCase());
  if (!e.success) return { ok: false, error: "Digite um e-mail válido." };
  const owner = await ownerByEmail(e.data);
  if (owner && (await ownerReady(owner.id)).owner) {
    const r = await issueCode(owner.id, "bank", owner.email, owner.name);
    if (!r.ok && r.error.startsWith("Muitos")) return r;
  }
  return { ok: true, to: maskEmail(e.data) };
}

/** Passo 2: confere o código do e-mail. */
export async function bankSetupEmail(email: string, code: string): Promise<R & { totp?: boolean }> {
  const owner = await ownerByEmail(email.trim().toLowerCase());
  if (!owner) return { ok: false, error: "Código incorreto ou expirado." };
  const r = await checkCode(owner.id, "bank", code);
  if (!r.ok) return r;
  const ready = await ownerReady(owner.id);
  if (!ready.owner) return { ok: false, error: "Só o dono dos eventos tem acesso ao banco." };
  await setBankSetup(owner.id, "email");
  return { ok: true, totp: ready.totp };
}

/** Passo 3: código do app autenticador. */
export async function bankSetupTotp(code: string): Promise<R> {
  const st = await bankSetup();
  if (!st) return { ok: false, error: "O tempo acabou. Comece de novo." };
  if ((await mfaSettings(st.userId)).method !== "totp") return { ok: false, error: NEED_APP };
  if (/[a-z]/i.test(code)) return { ok: false, error: "Use o código do app autenticador." };
  const r = await checkSecondFactor(st.userId, "bank", code);
  if (!r.ok) return r;
  await setBankSetup(st.userId, "totp");
  return { ok: true };
}

/** Passo 4: senha do banco (diferente da senha do site). */
export async function bankSetupPassword(password: string): Promise<R> {
  const st = await bankSetup();
  if (!st || st.stage !== "totp") return { ok: false, error: "O tempo acabou. Comece de novo." };
  if (password.length < 10) return { ok: false, error: "A senha do banco precisa ter pelo menos 10 caracteres." };
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) return { ok: false, error: "Use letras e números na senha do banco." };
  const passwordHash = await hashBankPassword(password);
  const had = !!(await bankCredential(st.userId));
  await db.insert(schema.bankCredentials).values({ userId: st.userId, passwordHash }).onConflictDoUpdate({ target: schema.bankCredentials.userId, set: { passwordHash, failed: 0, lockedUntil: null } });
  await clearBankSetup();
  await closeBankSession();
  await logSecurity(st.userId, "bank", had ? "Senha do banco trocada" : "Acesso ao banco criado");
  const c = await userContact(st.userId);
  if (c) after(() => mailSecurityNotice(c.email, had ? "A senha do Banco Tickets Win mudou" : "Acesso ao Banco Tickets Win criado", had ? "A senha do Banco Tickets Win da sua conta acabou de ser trocada. Se não foi você, troque a senha do site e fale com a gente pela Ajuda." : "Você criou o acesso ao Banco Tickets Win. Para entrar, use seu e-mail, a senha do banco e o código do app autenticador."));
  return { ok: true };
}

/* ============================== saques ============================== */

/** Pede um saque do saldo disponível para a conta cadastrada no painel. Confirma com o código do app. */
export async function requestPayout(amountCents: number, code: string): Promise<R> {
  const userId = await bankUserId();
  if (!userId) return { ok: false, error: "Sua sessão do banco expirou. Entre de novo." };
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount < MIN_PAYOUT) return { ok: false, error: `O saque mínimo é ${brl(MIN_PAYOUT)}.` };
  const w = await walletFor(userId);
  if (!w) return { ok: false, error: "Só o dono dos eventos pode sacar." };
  if (!hasDestination(w.destination)) return { ok: false, error: "Cadastre a conta para receber em Painel → Configurações → Conta de repasse." };
  if (amount > w.available) return { ok: false, error: `Você pode sacar até ${brl(w.available)}.` };
  if (/[a-z]/i.test(code)) return { ok: false, error: "Use o código do app autenticador." };
  const ok = await checkSecondFactor(userId, "bank", code);
  if (!ok.ok) return ok;
  if (ok.how !== "totp") return { ok: false, error: NEED_APP };
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
