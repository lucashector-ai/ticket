import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

type Middleware = ReturnType<typeof auth.middleware>;
let middleware: Middleware | undefined;

/** Rotas que exigem login. O checkout (/checkout) é público: a conta é pedida dentro dele. */
const PROTECTED = ["/meus-ingressos", "/conta", "/ingressos"];

/** Parâmetro com que o Neon Auth volta do Google; precisa ser trocado pela sessão. */
const OAUTH_VERIFIER = "neon_auth_session_verifier";

export default function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/checkout/");
  const returningFromOAuth = searchParams.has(OAUTH_VERIFIER);
  if (!isProtected && !returningFromOAuth) return NextResponse.next();
  middleware ??= auth.middleware({ loginUrl: "/entrar" });
  return middleware(request);
}

export const config = {
  // todas as páginas; ficam de fora API, arquivos estáticos e imagens
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
