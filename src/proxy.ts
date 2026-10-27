import { auth } from "@/lib/auth/server";

// Protege as rotas que exigem sessão. O restante do site é público.
export default auth.middleware({ loginUrl: "/entrar" });

export const config = {
  matcher: ["/meus-ingressos/:path*", "/conta/:path*", "/checkout/:path*"],
};
