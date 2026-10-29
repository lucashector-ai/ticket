"use server";

import { z } from "zod";
import { getAuthState } from "@/lib/auth/server";
import { checkSecondFactor, clearSession, issueCode, lastSent, logSecurity, maskEmail, mfaSettings, rememberDevice, RESEND_AFTER, type MfaMethod } from "@/lib/mfa";

type Sent = { ok: boolean; error?: string; ch?: MfaMethod; to?: string; wait?: number };

/** Ao abrir /verificacao: no app autenticador não há envio; no e-mail garante um código a caminho (sem reenviar). */
export async function ensureLoginCode(): Promise<Sent> {
  const st = await getAuthState();
  if (!st.user || !st.pending) return { ok: false };
  const s = await mfaSettings(st.user.id);
  if (s.method === "totp") return { ok: true, ch: "totp" };
  const email = s.email || st.user.email;
  const last = await lastSent(st.user.id, "login");
  if (last) return { ok: true, ch: "email", to: maskEmail(email), wait: Math.max(0, RESEND_AFTER - Math.floor((Date.now() - last.at) / 1000)) };
  const r = await issueCode(st.user.id, "login", email, s.name);
  return r.ok ? { ok: true, ch: "email", to: maskEmail(email), wait: RESEND_AFTER } : { ok: false, error: r.error, ch: "email", to: maskEmail(email) };
}

/** "Reenviar código" (só no método por e-mail). */
export async function resendLoginCode(): Promise<Sent> {
  const st = await getAuthState();
  if (!st.user || !st.pending) return { ok: false };
  const s = await mfaSettings(st.user.id);
  if (s.method === "totp") return { ok: false, error: "Use o código do seu app autenticador." };
  const email = s.email || st.user.email;
  const r = await issueCode(st.user.id, "login", email, s.name);
  return r.ok ? { ok: true, ch: "email", to: maskEmail(email) } : { ok: false, error: r.error, ch: "email", to: maskEmail(email) };
}

/** Confere o código (do app, de recuperação ou do e-mail) e libera a sessão. */
export async function verifyLoginCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const p = z.string().trim().min(6).max(12).safeParse(code);
  if (!p.success) return { ok: false, error: "Digite o código de 6 números." };
  const st = await getAuthState();
  if (!st.user || !st.sessionId) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!st.pending) return { ok: true };
  const r = await checkSecondFactor(st.user.id, "login", p.data);
  if (!r.ok) return r;
  await clearSession(st.sessionId);
  await rememberDevice(st.token);
  await logSecurity(st.user.id, "login", r.how === "totp" ? "Duas etapas (app autenticador)" : r.how === "recovery" ? "Duas etapas (código de recuperação)" : "Duas etapas (e-mail)");
  return { ok: true };
}
