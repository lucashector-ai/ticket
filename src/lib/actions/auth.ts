"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";
import { db, schema } from "@/db";
import { emailEnabled, logEmails } from "@/lib/email";
import { issueCode, logSecurity, mfaSettings, rememberDevice } from "@/lib/mfa";
import { HUMAN_ERROR, verifyHuman } from "@/lib/turnstile";
import { linkThrottled } from "@/lib/password-link";
import { normalizePhone, phoneValid } from "@/lib/phone";

export type AuthState = { error?: string; ok?: boolean } | null;

const signInSchema = z.object({ email: z.string().email("Confira o e-mail."), password: z.string().min(1, "Digite sua senha.") });
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome."),
  email: z.string().email("Confira o e-mail."),
  phone: z.string().transform(normalizePhone).refine(phoneValid, "Confira o celular (com DDD, no Brasil)."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

const safeNext = (v: unknown) => safeNextParam(typeof v === "string" ? v : "");

const userIdOf = (data: unknown) => (data as { user?: { id?: string } } | null)?.user?.id ?? null;
const tokenOf = (data: unknown) => (data as { token?: string } | null)?.token ?? null;

/**
 * Depois da senha: se a conta tem verificação em duas etapas, devolve true (a pessoa vai para /verificacao); no método por e-mail o código já sai agora. Senão registra a entrada.
 */
async function secondStep(userId: string | null, token: string | null): Promise<boolean> {
  if (!userId) return false;
  await rememberDevice(token);
  const s = await mfaSettings(userId);
  if (s.method) {
    if (s.method === "email" && s.email) await issueCode(userId, "login", s.email, s.name);
    return true;
  }
  await logSecurity(userId, "login", "E-mail e senha");
  return false;
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await verifyHuman(formData.get("cf-turnstile-response")))) return { error: HUMAN_ERROR };
  const { data, error } = await auth.signIn.email(parsed.data);
  if (error) return { error: friendly(error.message, error.code) };
  const next = safeNext(formData.get("next"));
  if (await secondStep(userIdOf(data), tokenOf(data))) redirect(`/verificacao?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), phone: String(formData.get("phone") ?? ""), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await verifyHuman(formData.get("cf-turnstile-response")))) return { error: HUMAN_ERROR };
  const { phone, ...cred } = parsed.data;
  const { data, error } = await auth.signUp.email(cred);
  if (error) return { error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) {
    await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email, phone }).onConflictDoNothing();
    await rememberDevice(tokenOf(data));
  }
  sendActivation(parsed.data.email);
  // segunda etapa do cadastro: digitar o código que chegou no e-mail
  const next = safeNext(formData.get("next"));
  redirect(next === "/" ? "/ativar-conta" : `/ativar-conta?next=${encodeURIComponent(next)}`);
}

export async function signOut() {
  await auth.signOut();
  (await cookies()).delete("tw_mfa");
  redirect("/");
}

/** Sai e abre o login voltando para `next` (ex.: receber um ingresso enviado para outra conta). */
export async function signOutTo(next: string) {
  await auth.signOut();
  (await cookies()).delete("tw_mfa");
  redirect(`/entrar?next=${encodeURIComponent(safeNextParam(next))}`);
}

function friendly(message?: string, code?: string) {
  if (code?.startsWith("NETWORK_")) return "Não foi possível falar com o servidor de login. Tente de novo em instantes.";
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid") && (m.includes("password") || m.includes("credential"))) return "E-mail ou senha incorretos.";
  if (m.includes("already exists") || m.includes("already registered")) return "Já existe uma conta com este e-mail. Faça login.";
  if (m.includes("not found")) return "Não encontramos uma conta com este e-mail.";
  return message || "Não foi possível entrar. Tente de novo.";
}

/** Login sem redirecionar (usado dentro do checkout). `mfa`: falta o código da segunda etapa. */
export async function signInInline(email: string, password: string, human: string): Promise<{ ok: boolean; error?: string; mfa?: boolean }> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await verifyHuman(human))) return { ok: false, error: HUMAN_ERROR };
  const { data, error } = await auth.signIn.email(parsed.data);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  return { ok: true, mfa: await secondStep(userIdOf(data), tokenOf(data)) };
}

/** Cadastro sem redirecionar (usado dentro do checkout). */
export async function signUpInline(name: string, email: string, password: string, phone: string, human: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = signUpSchema.safeParse({ name, email, phone, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await verifyHuman(human))) return { ok: false, error: HUMAN_ERROR };
  const { phone: tel, ...cred } = parsed.data;
  const { data, error } = await auth.signUp.email(cred);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) {
    await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email, phone: tel }).onConflictDoNothing();
    await rememberDevice(tokenOf(data));
  }
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

/** "Enviar outro código" da página /ativar-conta (um a cada 30s por e-mail). */
export async function resendActivation(email: string): Promise<{ ok: boolean; error?: string }> {
  const p = z.string().email().safeParse(email.trim().toLowerCase());
  if (!p.success) return { ok: false, error: "Digite um e-mail válido." };
  if (await linkThrottled(`ativ:${p.data}`)) return { ok: false, error: "Aguarde alguns segundos para pedir outro código." };
  await requestActivationCode(p.data);
  return { ok: true };
}
