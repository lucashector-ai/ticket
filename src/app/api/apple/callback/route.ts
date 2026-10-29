import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { APPLE_COOKIE, expectAppleOtp, readAppleCookie, takeAppleOtp, verifyAppleIdToken } from "@/lib/auth/apple";
import { auth } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";
import { logEmails } from "@/lib/email";
import { issueCode, logSecurity, mfaSettings, rememberDevice } from "@/lib/mfa";
import { mailWelcome } from "@/lib/notify";

/** "Nome Sobrenome" do campo `user` que a Apple manda só na primeira vez. */
function nameFrom(raw: FormDataEntryValue | null) {
  try {
    const n = (JSON.parse(String(raw ?? "")) as { name?: { firstName?: string; lastName?: string } }).name;
    return [n?.firstName, n?.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ").slice(0, 120);
  } catch {
    return "";
  }
}

/** Volta da Apple (POST, response_mode=form_post). Erros voltam para o login com um aviso. */
export async function POST(req: Request) {
  const form = await req.formData();
  const jar = await cookies();
  const saved = readAppleCookie(jar.get(APPLE_COOKIE)?.value, String(form.get("state") ?? ""));
  const hadCookie = jar.has(APPLE_COOKIE);
  jar.delete({ name: APPLE_COOKIE, path: "/api/apple" });
  const next = safeNextParam(saved?.next);
  // o registro precisa terminar antes da resposta: no Worker, o que fica pendente depois dela pode ser cortado
  const fail = async (why: string) => {
    if (why !== "cancelado") await logEmails("apple-login", [{ to: "", subject: why.slice(0, 120) }], false, why.slice(0, 300));
    return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(next)}&apple=${why === "cancelado" ? "cancelado" : "erro"}`, req.url), 303);
  };
  if (form.get("error")) return fail(String(form.get("error")) === "user_cancelled_authorize" ? "cancelado" : `apple: ${form.get("error")}`);
  if (!saved) return fail(`state diferente ou cookie ausente (cookie: ${hadCookie ? "sim" : "não"}, state: ${form.get("state") ? "sim" : "não"}, campos: ${[...form.keys()].join(",")})`);

  let who;
  try {
    who = await verifyAppleIdToken(String(form.get("id_token") ?? ""), saved.nonce);
  } catch (e) {
    return fail(`id_token: ${String(e)}`);
  }

  const name = nameFrom(form.get("user"));
  const found = await db.execute<{ id: string }>(sql`select id from neon_auth."user" where lower(email) = ${who.email} limit 1`).catch(() => null);
  if (!found) return fail("não foi possível consultar as contas");
  const isNew = found.rows.length === 0;

  let data: unknown;
  if (isNew) {
    // conta nova: o Neon Auth só manda código para quem já tem conta, então a conta nasce aqui, já com sessão.
    // A senha é aleatória e ninguém a conhece; se um dia quiser senha, a pessoa usa "Esqueci a senha".
    const r = await auth.signUp.email({ email: who.email, password: `${randomBytes(24).toString("base64url")}aA1!`, name: name || who.email.split("@")[0] });
    if (r.error) return fail(`signUp: ${r.error.message ?? r.error.code}`);
    data = r.data;
  } else {
    // conta existente: código de "entrar" do Neon Auth, que o nosso webhook guarda em vez de mandar por e-mail
    await expectAppleOtp(who.email);
    const sent = await auth.emailOtp.sendVerificationOtp({ email: who.email, type: "sign-in" }).catch((e) => ({ error: e }));
    if (sent && "error" in sent && sent.error) return fail(`otp: ${JSON.stringify(sent.error).slice(0, 200)}`);
    const otp = await takeAppleOtp(who.email);
    if (!otp) return fail("o código do Neon Auth não chegou pelo webhook");
    const r = await auth.signIn.emailOtp({ email: who.email, otp });
    if (r.error) return fail(`signIn: ${r.error.message ?? r.error.code}`);
    data = r.data;
  }

  const user = (data as { user?: { id?: string; name?: string | null } } | null)?.user;
  const userId = user?.id;
  if (!userId) return fail("sessão sem usuário");
  // a Apple já confirmou o e-mail: não pede ativação
  await db.execute(sql`update neon_auth."user" set "emailVerified" = true where id = ${userId} and not "emailVerified"`).catch(() => null);
  if (name && !user?.name?.trim()) await db.execute(sql`update neon_auth."user" set name = ${name} where id = ${userId} and coalesce(name, '') = ''`).catch(() => null);
  await db.insert(schema.userProfiles).values({ userId, name: name || user?.name?.trim() || null, email: who.email, appleSub: who.sub })
    .onConflictDoUpdate({ target: schema.userProfiles.userId, set: { appleSub: who.sub } }).catch(() => null);
  await rememberDevice((data as { token?: string } | null)?.token);
  if (isNew) after(() => mailWelcome(who.email, name || null));

  // mesma segunda etapa do login com senha
  const s = await mfaSettings(userId);
  if (s.method) {
    if (s.method === "email" && s.email) await issueCode(userId, "login", s.email, s.name);
    return NextResponse.redirect(new URL(`/verificacao?next=${encodeURIComponent(next)}`, req.url), 303);
  }
  await logSecurity(userId, "login", "Apple");
  return NextResponse.redirect(new URL(next, req.url), 303);
}
