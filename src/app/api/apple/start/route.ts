import { NextResponse } from "next/server";
import { APPLE_COOKIE, appleSignInEnabled, startAppleSignIn } from "@/lib/auth/apple";
import { siteUrl } from "@/lib/mail/data";
import { safeNextParam } from "@/lib/auth/next-param";

/** Botão "Entrar com Apple": manda para a Apple (a volta é em /api/apple/callback). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNextParam(url.searchParams.get("next"));
  if (!appleSignInEnabled()) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(next)}`, url));
  // a Apple sempre volta no endereço principal: o cookie precisa nascer nele (ex.: quem abriu pelo www.)
  const home = new URL(siteUrl());
  if (home.protocol === "https:" && url.host !== home.host) return NextResponse.redirect(new URL(`/api/apple/start${url.search}`, home));
  const { url: to, cookie } = startAppleSignIn(next);
  const res = NextResponse.redirect(to);
  res.cookies.set(APPLE_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "none", path: "/api/apple", maxAge: 600 });
  return res;
}
