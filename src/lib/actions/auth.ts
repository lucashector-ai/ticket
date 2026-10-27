"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";

export type AuthState = { error?: string; ok?: boolean } | null;

const signInSchema = z.object({ email: z.string().email("Confira o e-mail."), password: z.string().min(1, "Digite sua senha.") });
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome."),
  email: z.string().email("Confira o e-mail."),
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
  const parsed = signUpSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await auth.signUp.email(parsed.data);
  if (error) return { error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) {
    await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email }).onConflictDoNothing();
  }
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
export async function signUpInline(name: string, email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = signUpSchema.safeParse({ name, email, password });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { data, error } = await auth.signUp.email(parsed.data);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  const userId = (data as { user?: { id?: string } } | null)?.user?.id;
  if (userId) await db.insert(schema.userProfiles).values({ userId, name: parsed.data.name, email: parsed.data.email }).onConflictDoNothing();
  return { ok: true };
}
