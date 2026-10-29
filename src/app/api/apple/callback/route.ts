import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { APPLE_COOKIE, APPLE_DONE_COOKIE, readAppleCookie, sealApple, verifyAppleIdToken } from "@/lib/auth/apple";
import { safeNextParam } from "@/lib/auth/next-param";
import { logEmails } from "@/lib/email";

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

  // Terminar o login aqui não dá: o Neon Auth recusa pedidos cuja origem é a página da Apple (appleid.apple.com).
  // A identidade conferida vai lacrada num cookie e a página /entrar/apple termina o login a partir do nosso site.
  const sealed = await sealApple({ email: who.email, sub: who.sub, name: nameFrom(form.get("user")), next, exp: Date.now() + 120_000 });
  const res = NextResponse.redirect(new URL("/entrar/apple", req.url), 303);
  res.cookies.set(APPLE_DONE_COOKIE, sealed, { httpOnly: true, secure: true, sameSite: "lax", path: "/entrar/apple", maxAge: 120 });
  return res;
}
