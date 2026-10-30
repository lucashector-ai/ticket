import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { contentSecurityPolicy, cspHeaderName, newNonce } from "@/lib/csp";

type Middleware = ReturnType<typeof auth.middleware>;
let middleware: Middleware | undefined;

/** Rotas que exigem login. O checkout (/checkout) é público: a conta é pedida dentro dele. */
const PROTECTED = ["/meus-ingressos", "/conta", "/ingressos", "/criar-evento", "/meus-eventos"];

/** Parâmetro com que o Neon Auth volta do Google; precisa ser trocado pela sessão. */
const OAUTH_VERIFIER = "neon_auth_session_verifier";

/**
 * CSP com nonce novo a cada página: vai no pedido (o Next lê o nonce dali e coloca nos scripts dele) e na resposta
 * (o navegador aplica). Ver src/lib/csp.ts.
 */
function withCsp(request: NextRequest) {
  const nonce = newNonce();
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set(cspHeaderName().toLowerCase(), policy);
  headers.set("x-nonce", nonce);
  const sign = <T extends Response>(res: T) => {
    try {
      res.headers.set(cspHeaderName(), policy);
      res.headers.set("Reporting-Endpoints", 'csp="/api/csp-report"');
    } catch { /* cabeçalho imutável (redirecionamento pronto): segue sem */ }
    return res;
  };
  return { headers, sign };
}

export default async function proxy(request: NextRequest) {
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
    const csp = withCsp(request);
    return csp.sign(NextResponse.rewrite(url, { request: { headers: csp.headers } }));
  }
  // com o subdomínio configurado (BANK_URL), /banco no domínio principal leva para ele; sem ele, o banco fica em /banco
  if ((pathname === "/banco" || pathname.startsWith("/banco/")) && process.env.BANK_URL?.startsWith("https://")) {
    return NextResponse.redirect(new URL(pathname.slice(6) || "/", process.env.BANK_URL), 308);
  }
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/checkout/");
  const returningFromOAuth = searchParams.has(OAUTH_VERIFIER);
  const csp = withCsp(request);
  if (!isProtected && !returningFromOAuth) return csp.sign(NextResponse.next({ request: { headers: csp.headers } }));
  middleware ??= auth.middleware({ loginUrl: "/entrar" });
  // o middleware do login repassa os cabeçalhos do pedido que recebe (com a CSP e o nonce)
  return csp.sign(withNext(await middleware(new NextRequest(request, { headers: csp.headers })), request));
}

/**
 * O Neon Auth manda para /entrar sem dizer de onde a pessoa veio; com o `next`, depois de entrar
 * (ou criar a conta) ela volta para o que tentou abrir: o ingresso do e-mail, Criar evento, a Conta.
 */
function withNext(res: Response, request: NextRequest) {
  const loc = res.headers.get("location");
  if (!loc) return res;
  const url = new URL(loc, request.url);
  if (url.origin !== request.nextUrl.origin || url.pathname !== "/entrar" || url.searchParams.has("next")) return res;
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  try { res.headers.set("location", url.toString()); } catch { /* cabeçalho imutável: segue sem o next */ }
  return res;
}

export const config = {
  // todas as páginas; ficam de fora API, arquivos estáticos e imagens
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
