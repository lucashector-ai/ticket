"use server";

import { after } from "next/server";
import { z } from "zod";
import { auth, getAuthState } from "@/lib/auth/server";
import { logEmails } from "@/lib/email";
import { logSecurity, maskEmail } from "@/lib/mfa";
import { mailPasswordChanged } from "@/lib/notify";
import { dropResetLink, linkThrottled, readResetLink } from "@/lib/password-link";

type R = { ok: boolean; error?: string };

/** Pede ao Neon Auth o código de "esqueci a senha"; o nosso webhook transforma em link e manda o e-mail. */
async function sendLink(email: string): Promise<R> {
  if (await linkThrottled(email)) return { ok: false, error: "Aguarde um pouco antes de pedir outro link." };
  try {
    const r = await auth.emailOtp.sendVerificationOtp({ email, type: "forget-password" });
    if (r?.error) await logEmails("neon-otp", [{ to: email, subject: "forget-password" }], false, JSON.stringify(r.error).slice(0, 400));
  } catch (e) {
    await logEmails("neon-otp", [{ to: email, subject: "forget-password" }], false, String(e).slice(0, 400));
  }
  return { ok: true };
}

/** "Esqueci a senha": resposta sempre igual, para não revelar se o e-mail tem conta. */
export async function requestPasswordLink(email: string): Promise<R> {
  const p = z.string().trim().toLowerCase().email().safeParse(email);
  if (!p.success) return { ok: false, error: "Digite um e-mail válido." };
  const r = await sendLink(p.data);
  return r.error ? r : { ok: true };
}

/** Minha conta → Trocar senha: o link vai para o e-mail da própria conta. */
export async function sendMyPasswordLink(): Promise<R & { to?: string }> {
  const s = await getAuthState();
  if (!s.user || s.pending) return { ok: false, error: "Entre na sua conta de novo." };
  const r = await sendLink(s.user.email);
  if (r.ok) await logSecurity(s.user.id, "password", "Pediu link para trocar a senha");
  return r.ok ? { ok: true, to: maskEmail(s.user.email) } : r;
}

/** O link ainda vale? (a página mostra o e-mail mascarado) */
export async function checkResetLink(t: string): Promise<{ ok: boolean; to?: string }> {
  const l = await readResetLink(t);
  return l ? { ok: true, to: maskEmail(l.email) } : { ok: false };
}

/** Nova senha pelo link do e-mail (uso único). Desconecta os outros aparelhos e avisa por e-mail. */
export async function resetWithLink(t: string, password: string): Promise<R> {
  if (password.length < 8) return { ok: false, error: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (password.length > 200) return { ok: false, error: "Senha longa demais." };
  const l = await readResetLink(t);
  if (!l) return { ok: false, error: "Este link expirou ou já foi usado. Peça um novo." };
  const res = await auth.emailOtp.resetPassword({ email: l.email, otp: l.otp, password }).catch(() => null);
  if (!res || res.error) return { ok: false, error: "Este link expirou. Peça um novo." };
  await dropResetLink(t);
  after(() => mailPasswordChanged(l.email));
  return { ok: true };
}
