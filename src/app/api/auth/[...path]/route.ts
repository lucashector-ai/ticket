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

async function guard(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/api\/auth\//, "").replace(/\/$/, "");
  if (BLOCKED.includes(path)) return NextResponse.json({ message: "Use o formulário do site.", code: "FORBIDDEN" }, { status: 403 });
  if (NEEDS_MFA.includes(path) && (await getAuthState()).pending) return NextResponse.json({ message: "Confirme o código da verificação em duas etapas.", code: "MFA_REQUIRED" }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  return (await guard(request)) ?? get().GET(request, ctx);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return (await guard(request)) ?? get().POST(request, ctx);
}
