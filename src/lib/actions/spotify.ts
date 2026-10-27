"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { spotifyArtistId } from "@/lib/spotify";
import { canEditArtist, linkArtistSpotify } from "@/lib/spotify-artists";

export async function disconnectSpotify() {
  const user = await getSessionUser();
  if (!user) return;
  await db.delete(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, user.id));
  revalidatePath("/");
}

/** Liga a página do artista a um perfil do Spotify (link, URI ou id). */
export async function connectArtistSpotify(artistId: string, spotify: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const sid = spotifyArtistId(spotify);
  if (!sid) return { ok: false, error: "Cole o link do artista no Spotify (open.spotify.com/artist/…)." };
  if (!(await canEditArtist(user.id, artistId))) return { ok: false, error: "Só quem tem evento com este artista pode ligar o Spotify." };
  const artist = await db.query.artists.findFirst({ where: eq(schema.artists.id, artistId), columns: { slug: true } });
  if (!artist) return { ok: false, error: "Artista não encontrado." };
  const r = await linkArtistSpotify(artistId, sid);
  if (r.ok) revalidatePath(`/artistas/${artist.slug}`);
  return r;
}
