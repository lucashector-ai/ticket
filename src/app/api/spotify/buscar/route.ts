import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { searchArtists, spotifyEnabled } from "@/lib/spotify";

/** Busca de artistas no Spotify (line-up da criação de evento e página do artista). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  if (!spotifyEnabled()) return NextResponse.json({ error: "Spotify não configurado neste ambiente." }, { status: 503 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ artists: [] });
  const artists = await searchArtists(q);
  if (!artists) return NextResponse.json({ error: "O Spotify não respondeu. Tente de novo." }, { status: 502 });
  return NextResponse.json({ artists }, { headers: { "cache-control": "private, max-age=300" } });
}
