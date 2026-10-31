import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { reserveAttempt } from "@/lib/attempts";
import { auth } from "@/lib/auth/server";

type Handlers = ReturnType<typeof auth.handler>;
type Ctx = Parameters<Handlers["POST"]>[1];
let handlers: Handlers | undefined;
const get = () => (handlers ??= auth.handler());

/*
 * Proxy do Neon Auth (SEC-303 / SEC-006): LISTA DE PERMISSÃO. Só passa o que o navegador do site usa de verdade:
 *   get-session, token           sessão (o cliente do Neon Auth confere a sessão e o token da conta logada)
 *   sign-out                     Sair (cabeçalho, ativar conta com outro e-mail)
 *   sign-in/social, callback/*   Entrar com Google (src/components/auth/google-button.tsx, compra/inline-auth.tsx)
 *   email-otp/verify-email       código de ativação da conta (src/components/auth/activate-form.tsx), com freio próprio
 * Todo o resto (login e cadastro por senha, códigos de "entrar"/"esqueci a senha", link mágico, redefinir senha, trocar
 * senha/e-mail, 2FA, apagar conta, sessões, admin, organização...) é feito pelas nossas ações de servidor, que chamam
 * o Neon Auth direto do servidor (com Turnstile, segunda etapa e os nossos freios), ou não é usado: 403.
 * Entrar com Apple é todo nosso (src/lib/auth/apple.ts) e não passa por aqui.
 */
const ALLOWED: Record<string, readonly string[]> = {
  "get-session": ["GET"],
  token: ["GET"],
  "sign-out": ["POST"],
  "sign-in/social": ["POST"],
  "email-otp/verify-email": ["POST"],
};
const allowed = (path: string, method: string) => (path.startsWith("callback/") ? method === "GET" || method === "POST" : !!ALLOWED[path]?.includes(method));

/** Código de ativação: 5 tentativas por e-mail a cada 15 min e 20 por IP a cada 10 min (contador atômico, SEC-303). */
const VERIFY_PER_EMAIL = 5, VERIFY_PER_IP = 20;
const TOO_MANY = "Muitas tentativas. Espere alguns minutos e peça um novo código.";

const deny = (message: string, status = 403, code = "FORBIDDEN") => NextResponse.json({ message, code }, { status });

async function verifyThrottled(request: NextRequest): Promise<NextResponse | null> {
  let email = "";
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch { /* corpo inválido: o Neon Auth responde 400 */ }
  const ip = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim().slice(0, 64);
  try {
    if (!(await reserveAttempt(`ip:${ip}`, "verify:ip", VERIFY_PER_IP, 600)).ok) return deny(TOO_MANY, 429, "TOO_MANY_REQUESTS");
    if (email) {
      const h = createHash("sha256").update(email).digest("base64url").slice(0, 32);
      if (!(await reserveAttempt(`email:${h}`, "verify:email", VERIFY_PER_EMAIL, 900)).ok) return deny(TOO_MANY, 429, "TOO_MANY_REQUESTS");
    }
  } catch (e) {
    console.error("auth proxy attempts", e);
    return deny("Não conseguimos conferir o código agora. Tente de novo em instantes.", 503, "UNAVAILABLE");
  }
  return null;
}

/*
 * O caminho conferido é o mesmo que vai para o Neon Auth: os segmentos já decodificados (`params.path`).
 * Conferir o pathname cru deixava passar "sign-in%2Femail", "sign-in/%65mail", "x/../sign-in/email"...
 * Caminho fora do formato das rotas do Neon Auth (%, \, espaço, segmentos vazios, "." ou "..") é recusado;
 * a comparação ignora maiúsculas.
 */
async function guard(request: NextRequest, ctx: Ctx) {
  const segs = (await ctx.params).path ?? [];
  const raw = segs.join("/").replace(/\/+$/, "");
  const parts = raw.split("/");
  if (!/^[A-Za-z0-9._/-]+$/.test(raw) || parts.some((p) => p === "" || p === "." || p === "..")) return deny("Caminho inválido.");
  const path = raw.toLowerCase();
  if (!allowed(path, request.method)) return deny("Use o formulário do site.");
  if (path === "email-otp/verify-email") return verifyThrottled(request);
  return null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  return (await guard(request, ctx)) ?? get().GET(request, ctx);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return (await guard(request, ctx)) ?? get().POST(request, ctx);
}
