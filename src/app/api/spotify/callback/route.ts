import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { exchangeCode, fetchMe, safeNext, withFlag } from "@/lib/spotify";

/** Volta do Spotify: guarda os artistas que a pessoa ouve e devolve para onde ela estava. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get("spotify_oauth")?.value;
  jar.delete({ name: "spotify_oauth", path: "/api/spotify" });
  let saved: { state?: string; next?: string; uid?: string } = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { /* cookie inválido */ }
  const next = safeNext(saved.next ?? null);
  const back = (flag: string) => NextResponse.redirect(new URL(withFlag(next, flag), url));

  const user = await getSessionUser();
  if (!user || user.id !== saved.uid) return back("erro");
  if (url.searchParams.get("error")) return back("cancelado");
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return back("erro");

  const token = await exchangeCode(code, `${url.origin}/api/spotify/callback`);
  if (!token) return back("erro");
  const me = await fetchMe(token);
  // em modo de desenvolvimento o Spotify só deixa entrar quem está cadastrado no painel do app
  if (!me) return back("nao-liberado");

  await db.insert(schema.spotifyConnections)
    .values({ userId: user.id, spotifyUserId: me.id, displayName: me.name, artists: me.artists })
    .onConflictDoUpdate({ target: schema.spotifyConnections.userId, set: { spotifyUserId: me.id, displayName: me.name, artists: me.artists, updatedAt: new Date() } });
  return back("conectado");
}
