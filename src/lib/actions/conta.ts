"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { auth, getAuthState } from "@/lib/auth/server";
import { checkCode, clearSession, currentDevice, devicesOf, issueCode, rememberDevice, logSecurity, maskEmail, maskPhone, mfaSettings, type MfaMethod } from "@/lib/mfa";
import { mailPasswordChanged, mailSecurityNotice } from "@/lib/notify";
import { waNumber, whatsappEnabled } from "@/lib/whatsapp";

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
  phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => !v || /^[1-9]\d{9,10}$/.test(v), "Confira o celular com DDD."),
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

/** Depois que o e-mail de login mudou (pelo código enviado ao novo e-mail): perfil, histórico e aviso no antigo. */
export async function emailChanged(oldEmail: string): Promise<R> {
  const { user } = await me();
  const { data } = await auth.getSession({ query: { disableCookieCache: "true" } });
  const now = data?.user?.email ?? user.email;
  await upsertProfile(user.id, { email: now });
  await logSecurity(user.id, "email", `E-mail trocado para ${maskEmail(now)}`);
  if (z.string().email().safeParse(oldEmail).success && oldEmail.toLowerCase() !== now.toLowerCase()) {
    after(() => mailSecurityNotice(oldEmail, "O e-mail da sua conta mudou", `O e-mail de acesso da sua conta na Tickets Win agora é ${maskEmail(now)}. Este endereço não recebe mais os avisos da conta.`));
  }
  revalidatePath("/conta");
  return { ok: true };
}

/* ============================== senha e aparelhos ============================== */

export async function changePassword(current: string, next: string, revokeOthers: boolean): Promise<R> {
  const { user } = await me();
  if (next.length < 8) return { ok: false, error: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (next === current) return { ok: false, error: "A nova senha precisa ser diferente da atual." };
  const r = await auth.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers });
  if (r?.error) {
    const m = (r.error.message ?? "").toLowerCase();
    return { ok: false, error: m.includes("password") || m.includes("invalid") ? "A senha atual não confere." : "Não foi possível trocar a senha agora." };
  }
  await logSecurity(user.id, "password", revokeOthers ? "Senha trocada e outros aparelhos desconectados" : "Senha trocada");
  after(() => mailPasswordChanged(user.email));
  return { ok: true };
}

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

/* ============================== duas etapas ============================== */

/** Liga (ou troca) a verificação em duas etapas: manda um código para o novo destino. */
export async function startMfa(method: MfaMethod, phone?: string): Promise<R & { to?: string }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (method === "whatsapp") {
    if (!whatsappEnabled()) return { ok: false, error: "O código pelo WhatsApp ainda não está disponível. Use o e-mail." };
    const n = waNumber(phone ?? "");
    if (!n) return { ok: false, error: "Digite o celular com DDD." };
    const r = await issueCode(user.id, "setup", "whatsapp", n, s.name);
    return r.ok ? { ok: true, to: maskPhone(n) } : r;
  }
  const email = s.email || user.email;
  const r = await issueCode(user.id, "setup", "email", email, s.name);
  return r.ok ? { ok: true, to: maskEmail(email) } : r;
}

export async function confirmMfa(code: string): Promise<R> {
  const { user, sessionId } = await me();
  const r = await checkCode(user.id, "setup", code);
  if (!r.ok) return r;
  await upsertProfile(user.id, { mfaMethod: r.ch, mfaPhone: r.ch === "whatsapp" ? r.to : null });
  // esta sessão já provou o código: continua liberada
  await clearSession(user.id, sessionId, false);
  const how = r.ch === "whatsapp" ? `pelo WhatsApp ${maskPhone(r.to)}` : "por e-mail";
  await logSecurity(user.id, "mfa_on", r.ch === "whatsapp" ? `WhatsApp ${maskPhone(r.to)}` : "Código por e-mail");
  after(() => mailSecurityNotice(user.email, "Verificação em duas etapas ligada", `A partir de agora, ao entrar na sua conta com a senha, vamos pedir um código enviado ${how}.`));
  revalidatePath("/conta/seguranca");
  return { ok: true };
}

/** Desligar pede o código do método atual. */
export async function startMfaOff(): Promise<R & { to?: string }> {
  const { user } = await me();
  const s = await mfaSettings(user.id);
  if (!s.method) return { ok: false, error: "A verificação em duas etapas já está desligada." };
  const wa = s.method === "whatsapp" && !!s.phone;
  const to = wa ? s.phone! : s.email || user.email;
  const r = await issueCode(user.id, "off", wa ? "whatsapp" : "email", to, s.name);
  return r.ok ? { ok: true, to: wa ? maskPhone(to) : maskEmail(to) } : r;
}

export async function confirmMfaOff(code: string): Promise<R> {
  const { user } = await me();
  const r = await checkCode(user.id, "off", code);
  if (!r.ok) return r;
  await db.update(userProfiles).set({ mfaMethod: null, mfaPhone: null }).where(eq(userProfiles.userId, user.id));
  await logSecurity(user.id, "mfa_off");
  after(() => mailSecurityNotice(user.email, "Verificação em duas etapas desligada", "A verificação em duas etapas da sua conta foi desligada. Ao entrar, vamos pedir só a senha."));
  revalidatePath("/conta/seguranca");
  return { ok: true };
}
