"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import { emailEnabled, logEmails } from "@/lib/email";
import { mailPasswordChanged } from "@/lib/notify";

export type AuthState = { error?: string; ok?: boolean } | null;

const signInSchema = z.object({ email: z.string().email("Confira o e-mail."), password: z.string().min(1, "Digite sua senha.") });
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome."),
  email: z.string().email("Confira o e-mail."),
  phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => /^[1-9]\d{9,10}$/.test(v), "Digite o celular com DDD."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

function safeNext(v: unknown) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await auth.signIn.email(parsed.data);
  if (error) return { error: friendly(error.message, error.code) };
  redirect(safeNext(formData.get("next")));
}

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), phone: String(formData.get("phone") ?? ""), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { phone, ...cred } = parsed.data;
  const { data, error } = await auth.signUp.email(cred);
  if (error) return { error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) {
    await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email, phone }).onConflictDoNothing();
  }
  sendActivation(parsed.data.email);
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await auth.signOut();
  redirect("/");
}

function friendly(message?: string, code?: string) {
  if (code?.startsWith("NETWORK_")) return "Não foi possível falar com o servidor de login. Tente de novo em instantes.";
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid") && (m.includes("password") || m.includes("credential"))) return "E-mail ou senha incorretos.";
  if (m.includes("already exists") || m.includes("already registered")) return "Já existe uma conta com este e-mail. Faça login.";
  if (m.includes("not found")) return "Não encontramos uma conta com este e-mail.";
  return message || "Não foi possível entrar. Tente de novo.";
}

/** Login sem redirecionar (usado dentro do checkout). */
export async function signInInline(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await auth.signIn.email(parsed.data);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  return { ok: true };
}

/** Cadastro sem redirecionar (usado dentro do checkout). */
export async function signUpInline(name: string, email: string, password: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = signUpSchema.safeParse({ name, email, phone, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { phone: tel, ...cred } = parsed.data;
  const { data, error } = await auth.signUp.email(cred);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email, phone: tel }).onConflictDoNothing();
  sendActivation(parsed.data.email);
  return { ok: true };
}

/** E-mail de ativação (código de confirmação) logo depois do cadastro. A conta já funciona antes de confirmar. */
function sendActivation(email: string) {
  if (!emailEnabled()) return;
  after(() => requestActivationCode(email));
}

/** Pede ao Neon Auth um código de ativação (o e-mail sai pelo nosso webhook). Registra falhas em email_log. */
async function requestActivationCode(email: string) {
  try {
    const r = await auth.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    if (r?.error) await logEmails("neon-otp", [{ to: email, subject: "email-verification" }], false, JSON.stringify(r.error).slice(0, 400));
  } catch (e) {
    console.error("activation", e);
    await logEmails("neon-otp", [{ to: email, subject: "email-verification" }], false, String(e).slice(0, 400));
  }
}

/** "Enviar outro código" da página /ativar-conta. */
export async function resendActivation(email: string): Promise<{ ok: true }> {
  const p = z.string().email().safeParse(email.trim().toLowerCase());
  if (p.success) await requestActivationCode(p.data);
  return { ok: true };
}

/** Nova senha com o código do e-mail; avisa por e-mail que a senha mudou. */
export async function resetPasswordWithCode(email: string, otp: string, password: string): Promise<{ ok: boolean }> {
  const p = z.object({ email: z.string().email(), otp: z.string().trim().min(4).max(12), password: z.string().min(8).max(200) }).safeParse({ email, otp, password });
  if (!p.success) return { ok: false };
  const res = await auth.emailOtp.resetPassword({ email: p.data.email, otp: p.data.otp, password: p.data.password });
  if (res?.error) return { ok: false };
  after(() => mailPasswordChanged(p.data.email));
  return { ok: true };
}
