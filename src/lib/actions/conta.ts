"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { auth, getAuthState } from "@/lib/auth/server";
import QRCode from "qrcode";
import {
  checkCode, checkSecondFactor, clearSession, currentDevice, devicesOf, dropStep, dropTotpSetup, grantStep, hasStep, issueCode, lastSent, logSecurity, maskEmail, mfaSettings,
  newRecoveryCodes, newTotpSecret, rememberDevice, sealSecret, stashTotpSetup, takeTotpSetup, totpUri, verifyTotp,
} from "@/lib/mfa";
import { mailSecurityNotice } from "@/lib/notify";
import { normalizePhone, phoneValid } from "@/lib/phone";

type R = { ok: boolean; error?: string };

/** Pessoa logada e já passada pela segunda etapa (tudo aqui mexe na conta). */
async function me() {
  const s = await getAuthState();
  if (!s.user || !s.sessionId || s.pending) throw new Error("UNAUTHENTICATED");
  return { user: s.user, sessionId: s.sessionId, token: s.token };
}

const { userProfiles } = schema;

async function upsertProfile(userId: string, patch: Partial<typeof userProfiles.$inferInsert>) {
  await db.insert(userProfiles).values({ userId, ...patch }).onConflictDoUpdate({ target: userProfiles.userId, set: patch });
}

/* ============================== dados ============================== */

const cpfOk = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
};

const profileSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome.").max(160),
  phone: z.string().transform(normalizePhone).refine((v) => !v || phoneValid(v), "Confira o celular (com DDD, no Brasil)."),
  cpf: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => !v || cpfOk(v), "CPF inválido."),
  birthDate: z.string().trim().refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) < new Date() && new Date(v) > new Date("1900-01-01")), "Confira a data de nascimento."),
  address: z.object({
    cep: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 8, "Confira o CEP."),
    street: z.string().trim().min(2, "Digite a rua.").max(160),
    number: z.string().trim().min(1, "Digite o número.").max(20),
    complement: z.string().trim().max(80).optional(),
    district: z.string().trim().min(2, "Digite o bairro.").max(120),
    city: z.string().trim().min(2, "Digite a cidade.").max(120),
    uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Confira o estado (UF)."),
  }).nullable(),
});

export async function saveProfile(input: z.input<typeof profileSchema>): Promise<R> {
  const { user } = await me();
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const d = p.data;
  await upsertProfile(user.id, {
    name: d.name, phone: d.phone || null, birthDate: d.birthDate || null, address: d.address,
    cpf: d.cpf ? `${d.cpf.slice(0, 3)}.${d.cpf.slice(3, 6)}.${d.cpf.slice(6, 9)}-${d.cpf.slice(9)}` : null,
  });
  if (d.name !== user.name) await auth.updateUser({ name: d.name }).catch(() => null);
  revalidatePath("/conta");
  return { ok: true };
}

/** Foto de perfil já enviada pelo /api/midia. `null` remove. */
export async function setAvatar(url: string | null): Promise<R> {
  const { user } = await me();
  if (url !== null && !/^\/midia\/[\w/.-]+$/.test(url)) return { ok: false, error: "Imagem inválida." };
  await upsertProfile(user.id, { avatarUrl: url });
  await auth.updateUser({ image: url ?? "" }).catch(() => null);
  revalidatePath("/conta");
  return { ok: true };
}

export async function setMarketing(on: boolean): Promise<R> {
  const { user } = await me();
  await upsertProfile(user.id, { marketingOptIn: !!on });
  return { ok: true };
}

/*
 * Trocar o e-mail de acesso, em 3 passos: (1) código no e-mail atual autoriza a troca (15 min);
 * (2) código no e-mail novo (o Neon Auth manda); (3) confirmado, o antigo recebe um aviso.
 */
export async function startEmailChange(): Promise<R & { to?: string }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  const r = await issueCode(user.id, "email", user.email, s.name);
  return r.ok ? { ok: true, to: maskEmail(user.email) } : r;
}

export async function resendEmailChangeCode(): Promise<R> {
  const { user } = await me();
  if (!(await lastSent(user.id, "email"))) return { ok: false, error: "Comece de novo." };
  return issueCode(user.id, "email", user.email, (await mfaSettings(user.id)).name);
}

export async function authorizeEmailChange(code: string): Promise<R> {
  const { user } = await me();
  const r = await checkCode(user.id, "email", code);
  if (!r.ok) return r;
  await grantStep(user.id, "email");
  return { ok: true };
}

/** Já existe conta com este e-mail? (no banco sem neon_auth, como o de testes, não dá para saber) */
async function emailTaken(email: string) {
  try {
    const r = await db.execute(sql`select 1 from neon_auth."user" where lower(email) = ${email} limit 1`);
    return (r.rows?.length ?? 0) > 0;
  } catch { return false; }
}

/** Passo 2: manda o código para o e-mail novo (só depois do código do e-mail atual). Também serve de "reenviar". */
export async function requestNewEmail(newEmail: string): Promise<R> {
  const { user } = await me();
  const v = z.string().trim().toLowerCase().email().safeParse(newEmail);
  if (!v.success) return { ok: false, error: "Digite um e-mail válido." };
  if (v.data === user.email.toLowerCase()) return { ok: false, error: "Este já é o seu e-mail." };
  if (!(await hasStep(user.id, "email"))) return { ok: false, error: "A autorização expirou. Cancele e comece de novo." };
  if (await emailTaken(v.data)) return { ok: false, error: "Já existe uma conta com este e-mail." };
  return issueCode(user.id, "newemail", v.data, (await mfaSettings(user.id)).name);
}

/**
 * Passo 3: confere o código do e-mail novo e troca o e-mail de login (tabela do Neon Auth, que não
 * oferece essa troca por código). Atualiza o perfil, registra e avisa o e-mail antigo.
 */
export async function confirmNewEmail(code: string): Promise<R> {
  const { user } = await me();
  if (!(await hasStep(user.id, "email"))) return { ok: false, error: "A autorização expirou. Cancele e comece de novo." };
  const r = await checkCode(user.id, "newemail", code);
  if (!r.ok) return r;
  const next = r.to.toLowerCase(), old = user.email;
  try {
    await db.execute(sql`update neon_auth."user" set email = ${next}, "emailVerified" = true, "updatedAt" = now() where id = ${user.id}`);
  } catch (e) {
    console.error("email change", e);
    return { ok: false, error: String(e).includes("unique") || String(e).includes("duplicate") ? "Já existe uma conta com este e-mail." : "Não foi possível trocar o e-mail agora." };
  }
  await dropStep(user.id, "email");
  // renova o cookie da sessão para o site já mostrar o e-mail novo
  await auth.getSession({ query: { disableCookieCache: "true" } }).catch(() => null);
  await upsertProfile(user.id, { email: next });
  await logSecurity(user.id, "email", `E-mail trocado para ${maskEmail(next)}`);
  after(() => mailSecurityNotice(old, "O e-mail da sua conta mudou", `O e-mail de acesso da sua conta na Tickets Win agora é ${maskEmail(next)}. Este endereço não recebe mais os avisos da conta.`));
  revalidatePath("/conta");
  return { ok: true };
}

/* ============================== senha e aparelhos ============================== */

export type DeviceRow = { token: string; current: boolean; device: string; ip: string | null; createdAt: string; updatedAt: string };

/** "Mac · Chrome", "iPhone · Safari"... a partir do user-agent. */
function deviceName(ua?: string | null) {
  if (!ua) return "Aparelho desconhecido";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${os} · ${br}`;
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { sessionId, token } = await me();
  await rememberDevice(token); // ex.: entrou com o Google, que não passa pelo nosso login
  const r = await auth.listSessions().catch(() => null);
  const rows = (r?.data ?? []) as { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: string | Date; updatedAt: string | Date }[];
  // o Neon Auth só vê o nosso servidor; aparelho e IP de verdade ficam guardados no login
  const [known, here] = await Promise.all([devicesOf(rows.map((s) => s.token)), currentDevice()]);
  return rows
    .map((s) => {
      const current = s.id === sessionId;
      const d = current ? here : known.get(s.token);
      return { token: s.token, current, device: deviceName(d?.ua ?? null), ip: d?.ip || null, createdAt: new Date(s.createdAt).toISOString(), updatedAt: new Date(s.updatedAt).toISOString() };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function revokeDevice(token: string): Promise<R> {
  const { user } = await me();
  const r = await auth.revokeSession({ token });
  if (r?.error) return { ok: false, error: "Não foi possível desconectar este aparelho." };
  await logSecurity(user.id, "session", "Aparelho desconectado");
  return { ok: true };
}

export async function revokeOtherDevices(): Promise<R> {
  const { user } = await me();
  const r = await auth.revokeOtherSessions();
  if (r?.error) return { ok: false, error: "Não foi possível desconectar os outros aparelhos." };
  await logSecurity(user.id, "session", "Todos os outros aparelhos desconectados");
  return { ok: true };
}

/** Como a pessoa entra: senha própria e/ou Google (conta criada pelo Google não tem senha aqui). */
export async function loginMethods(): Promise<{ password: boolean; google: boolean }> {
  await me();
  const r = await auth.listAccounts().catch(() => null);
  const ids = ((r?.data ?? []) as { providerId?: string }[]).map((a) => a.providerId);
  return { password: ids.includes("credential"), google: ids.includes("google") };
}

/* ============================== duas etapas ============================== */

/**
 * Código por e-mail: manda um código para confirmar que o e-mail é da pessoa.
 * Quem usa o app autenticador troca direto, confirmando antes com o código do app (`current`).
 */
export async function startEmailMfa(current?: string): Promise<R & { to?: string; needApp?: boolean }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (s.method === "totp") {
    if (!current) return { ok: true, needApp: true };
    const ok = await checkSecondFactor(user.id, "off", current);
    if (!ok.ok) return ok;
  }
  const email = s.email || user.email;
  const r = await issueCode(user.id, "setup", email, s.name);
  return r.ok ? { ok: true, to: maskEmail(email) } : r;
}

/** "Reenviar código" das telas de ligar/desligar por e-mail (só depois de um primeiro envio). */
export async function resendMfaCode(purpose: "setup" | "off"): Promise<R> {
  const { user } = await me();
  if (!(await lastSent(user.id, purpose))) return { ok: false, error: "Comece de novo." };
  const s = await mfaSettings(user.id);
  if (purpose === "off" && s.method !== "email") return { ok: false, error: "Use o código do app autenticador." };
  return issueCode(user.id, purpose, s.email || user.email, s.name);
}

export async function confirmEmailMfa(code: string): Promise<R> {
  const { user, sessionId } = await me();
  const r = await checkCode(user.id, "setup", code);
  if (!r.ok) return r;
  const wasApp = (await mfaSettings(user.id)).method === "totp";
  await upsertProfile(user.id, { mfaMethod: "email", mfaTotp: null, mfaRecovery: null });
  // esta sessão já provou o código: continua liberada
  await clearSession(sessionId);
  await logSecurity(user.id, "mfa_on", wasApp ? "Trocou o app autenticador pelo código por e-mail" : "Código por e-mail");
  after(() => mailSecurityNotice(user.email, wasApp ? "Duas etapas agora por e-mail" : "Verificação em duas etapas ligada", wasApp
    ? "A verificação em duas etapas da sua conta deixou de usar o app autenticador. Ao entrar, vamos pedir um código enviado por e-mail. O Banco Tickets Win fica bloqueado até você cadastrar um app autenticador de novo."
    : "A partir de agora, ao entrar na sua conta, vamos pedir um código enviado por e-mail."));
  revalidatePath("/conta/seguranca");
  return { ok: true };
}

/**
 * App autenticador, passo 1: gera o segredo e o QR code para cadastrar no app.
 * Se já existe um app cadastrado, trocar exige o código dele (`current`).
 */
export async function startTotp(current?: string): Promise<R & { qr?: string; key?: string; uri?: string }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (s.method === "totp") {
    const ok = await checkSecondFactor(user.id, "off", current ?? "");
    if (!ok.ok) return { ok: false, error: current ? ok.error : "Digite o código do app atual para trocar de aparelho." };
  }
  const secretB32 = newTotpSecret();
  await stashTotpSetup(user.id, secretB32);
  const uri = totpUri(secretB32, s.email || user.email);
  const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffffff" } });
  return { ok: true, qr, uri, key: secretB32.match(/.{1,4}/g)!.join(" ") };
}

/** App autenticador, passo 2: confere o primeiro código e liga. Devolve os códigos de recuperação (mostrados uma vez só). */
export async function confirmTotp(code: string): Promise<R & { codes?: string[] }> {
  const { user, sessionId } = await me();
  const secretB32 = await takeTotpSetup(user.id);
  if (!secretB32) return { ok: false, error: "O tempo para cadastrar acabou. Comece de novo." };
  if (!(await verifyTotp(secretB32, code))) return { ok: false, error: "Código incorreto. Confira se o horário do celular está automático e digite o código atual." };
  const { codes, hashes } = newRecoveryCodes(user.id);
  await upsertProfile(user.id, { mfaMethod: "totp", mfaTotp: await sealSecret(secretB32), mfaRecovery: hashes });
  await dropTotpSetup(user.id);
  await clearSession(sessionId);
  await logSecurity(user.id, "mfa_on", "App autenticador");
  after(() => mailSecurityNotice(user.email, "App autenticador cadastrado", "A verificação em duas etapas da sua conta agora usa um app autenticador. Ao entrar, vamos pedir o código de 6 números do app."));
  revalidatePath("/conta/seguranca");
  return { ok: true, codes };
}

/** Códigos de recuperação novos (os antigos deixam de valer). Exige o código do app. */
export async function renewRecovery(code: string): Promise<R & { codes?: string[] }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (s.method !== "totp") return { ok: false, error: "Os códigos de recuperação são do app autenticador." };
  if (/[a-z]/i.test(code)) return { ok: false, error: "Use o código do app autenticador." };
  const r = await checkSecondFactor(user.id, "off", code);
  if (!r.ok) return r;
  const { codes, hashes } = newRecoveryCodes(user.id);
  await upsertProfile(user.id, { mfaRecovery: hashes });
  await logSecurity(user.id, "mfa_on", "Novos códigos de recuperação");
  revalidatePath("/conta/seguranca");
  return { ok: true, codes };
}

/** Desligar: no e-mail manda um código; no app autenticador pede o código do app (ou de recuperação). */
export async function startMfaOff(): Promise<R & { to?: string; totp?: boolean }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (!s.method) return { ok: false, error: "A verificação em duas etapas já está desligada." };
  if (s.method === "totp") return { ok: true, totp: true };
  const email = s.email || user.email;
  const r = await issueCode(user.id, "off", email, s.name);
  return r.ok ? { ok: true, to: maskEmail(email) } : r;
}

export async function confirmMfaOff(code: string): Promise<R> {
  const { user } = await me();
  const r = await checkSecondFactor(user.id, "off", code);
  if (!r.ok) return r;
  await db.update(userProfiles).set({ mfaMethod: null, mfaTotp: null, mfaRecovery: null }).where(eq(userProfiles.userId, user.id));
  await logSecurity(user.id, "mfa_off");
  after(() => mailSecurityNotice(user.email, "Verificação em duas etapas desligada", "A verificação em duas etapas da sua conta foi desligada. Ao entrar, vamos pedir só a senha. O Banco Tickets Win fica bloqueado até você cadastrar um app autenticador de novo."));
  revalidatePath("/conta/seguranca");
  return { ok: true };
}
