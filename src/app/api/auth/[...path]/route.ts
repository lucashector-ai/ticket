import { NextResponse, type NextRequest } from "next/server";
import { auth, getAuthState } from "@/lib/auth/server";

type Handlers = ReturnType<typeof auth.handler>;
type Ctx = Parameters<Handlers["POST"]>[1];
let handlers: Handlers | undefined;
const get = () => (handlers ??= auth.handler());

/*
 * Login e cadastro por senha só pelas nossas ações (com verificador de humanos e segunda etapa).
 * Trocar o e-mail também: é feito em Minha conta, com código no e-mail atual e no novo.
 */
const BLOCKED = ["sign-in/email", "sign-up/email", "sign-in/email-otp", "change-email", "email-otp/request-email-change", "email-otp/change-email"];
/* Mexer na conta exige a segunda etapa concluída. */
const NEEDS_MFA = ["change-email", "email-otp/request-email-change", "email-otp/change-email", "change-password", "update-user", "delete-user", "revoke-session", "revoke-sessions", "revoke-all-sessions", "revoke-other-sessions", "list-sessions", "list-accounts", "link-social", "unlink-account"];

/*
 * O caminho conferido é o mesmo que vai para o Neon Auth: os segmentos já decodificados (`params.path`).
 * Conferir o pathname cru deixava passar "sign-in%2Femail", "sign-in/%65mail", "x/../sign-in/email"...
 * Caminho fora do formato das rotas do Neon Auth (%, \, espaço, segmentos vazios, "." ou "..") é recusado;
 * a comparação ignora maiúsculas.
 */
async function guard(ctx: Ctx) {
  const segs = (await ctx.params).path ?? [];
  const raw = segs.join("/").replace(/\/+$/, "");
  const parts = raw.split("/");
  if (!/^[A-Za-z0-9._/-]+$/.test(raw) || parts.some((p) => p === "" || p === "." || p === "..")) {
    return NextResponse.json({ message: "Caminho inválido.", code: "FORBIDDEN" }, { status: 403 });
  }
  const path = raw.toLowerCase();
  if (BLOCKED.includes(path)) return NextResponse.json({ message: "Use o formulário do site.", code: "FORBIDDEN" }, { status: 403 });
  if (NEEDS_MFA.includes(path) && (await getAuthState()).pending) return NextResponse.json({ message: "Confirme o código da verificação em duas etapas.", code: "MFA_REQUIRED" }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  return (await guard(ctx)) ?? get().GET(request, ctx);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return (await guard(ctx)) ?? get().POST(request, ctx);
}
