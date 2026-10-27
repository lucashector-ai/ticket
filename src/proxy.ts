import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

type Middleware = ReturnType<typeof auth.middleware>;
let middleware: Middleware | undefined;

// Protege as rotas que exigem sessão. O restante do site é público.
export default function proxy(request: NextRequest) {
  middleware ??= auth.middleware({ loginUrl: "/entrar" });
  return middleware(request);
}

export const config = {
  matcher: ["/meus-ingressos/:path*", "/conta/:path*", "/checkout/:path*"],
};
