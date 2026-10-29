import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

type Middleware = ReturnType<typeof auth.middleware>;
let middleware: Middleware | undefined;

/** Rotas que exigem login. O checkout (/checkout) é público: a conta é pedida dentro dele. */
const PROTECTED = ["/meus-ingressos", "/conta", "/ingressos", "/criar-evento", "/meus-eventos"];

/** Parâmetro com que o Neon Auth volta do Google; precisa ser trocado pela sessão. */
const OAUTH_VERIFIER = "neon_auth_session_verifier";

export default function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  // www.ticketswin.com.br → ticketswin.com.br (um endereço só)
  const host = request.headers.get("host") ?? "";
  if (host.startsWith("www.")) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  // Banco Tickets Win: banco.<domínio> mostra só as páginas de /banco (sem o prefixo na barra de endereço)
  if (host.startsWith("banco.")) {
    if (pathname === "/banco" || pathname.startsWith("/banco/")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice(6) || "/";
      return NextResponse.redirect(url, 308);
    }
    const url = request.nextUrl.clone();
    url.pathname = `/banco${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  // com o subdomínio configurado (BANK_URL), /banco no domínio principal leva para ele; sem ele, o banco fica em /banco
  if ((pathname === "/banco" || pathname.startsWith("/banco/")) && process.env.BANK_URL?.startsWith("https://")) {
    return NextResponse.redirect(new URL(pathname.slice(6) || "/", process.env.BANK_URL), 308);
  }
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
