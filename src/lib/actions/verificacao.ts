"use server";

import { z } from "zod";
import { getAuthState } from "@/lib/auth/server";
import { checkCode, clearSession, issueCode, lastSent, logSecurity, maskEmail, maskPhone, mfaSettings, rememberDevice, type MfaMethod } from "@/lib/mfa";
import { whatsappEnabled } from "@/lib/whatsapp";

type Sent = { ok: boolean; error?: string; ch?: MfaMethod; to?: string };

/** Destino do código de entrada: o método escolhido ou, a pedido, o e-mail da conta. */
async function target(userId: string, want?: MfaMethod) {
  const s = await mfaSettings(userId);
  const ch: MfaMethod = want === "email" || !s.method ? "email" : s.method === "whatsapp" && s.phone && whatsappEnabled() ? "whatsapp" : "email";
  const to = ch === "whatsapp" ? s.phone! : s.email ?? "";
  return { ch, to, name: s.name, masked: ch === "whatsapp" ? maskPhone(to) : maskEmail(to) };
}

/** Ao abrir /verificacao: garante que há um código a caminho (não reenvia se já saiu um). */
export async function ensureLoginCode(): Promise<Sent> {
  const st = await getAuthState();
  if (!st.user || !st.pending) return { ok: false };
  const prev = await lastSent(st.user.id, "login");
  const t = await target(st.user.id, prev?.ch);
  if (prev) return { ok: true, ch: t.ch, to: t.masked };
  if (!t.to) return { ok: false, error: "Sua conta não tem e-mail para receber o código. Fale com a Ajuda." };
  const r = await issueCode(st.user.id, "login", t.ch, t.to, t.name);
  return r.ok ? { ok: true, ch: t.ch, to: t.masked } : { ok: false, error: r.error, ch: t.ch, to: t.masked };
}

/** "Reenviar código" ou "receber por e-mail". */
export async function resendLoginCode(want?: MfaMethod): Promise<Sent> {
  const st = await getAuthState();
  if (!st.user || !st.pending) return { ok: false };
  const t = await target(st.user.id, want === "email" ? "email" : undefined);
  if (!t.to) return { ok: false, error: "Não há para onde enviar o código." };
  const r = await issueCode(st.user.id, "login", t.ch, t.to, t.name);
  return r.ok ? { ok: true, ch: t.ch, to: t.masked } : { ok: false, error: r.error, ch: t.ch, to: t.masked };
}

/** Confere o código e libera a sessão. `trust`: não pedir de novo neste aparelho por 30 dias. */
export async function verifyLoginCode(code: string, trust: boolean): Promise<{ ok: boolean; error?: string }> {
  const p = z.string().trim().min(6).max(12).safeParse(code);
  if (!p.success) return { ok: false, error: "Digite os 6 números do código." };
  const st = await getAuthState();
  if (!st.user || !st.sessionId) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!st.pending) return { ok: true };
  const r = await checkCode(st.user.id, "login", p.data);
  if (!r.ok) return r;
  await clearSession(st.user.id, st.sessionId, trust);
  await rememberDevice(st.token);
  await logSecurity(st.user.id, "login", `Duas etapas (${r.ch === "whatsapp" ? "WhatsApp" : "e-mail"})`);
  return { ok: true };
}
