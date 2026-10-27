import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { authorizeUrl, safeNext, withFlag } from "@/lib/spotify";

/** Começa o "Conectar Spotify": a pessoa já precisa estar logada no site. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/api/spotify/login?next=${encodeURIComponent(next)}`)}`, url));
  const state = crypto.randomUUID();
  const to = authorizeUrl(state, `${url.origin}/api/spotify/callback`);
  if (!to) return NextResponse.redirect(new URL(withFlag(next, "indisponivel"), url));
  (await cookies()).set("spotify_oauth", JSON.stringify({ state, next, uid: user.id }), {
    httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/spotify", maxAge: 600,
  });
  return NextResponse.redirect(to);
}
