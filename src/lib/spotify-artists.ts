import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SpotifyArtistData } from "@/db/schema";
import { fetchArtist } from "@/lib/spotify";

const { artists, eventArtists, events, organizers } = schema;

/** Dados do Spotify ficam válidos por uma semana; depois a página do artista pede de novo. */
export const SPOTIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Liga (ou religa) o artista a um perfil do Spotify e salva foto, gêneros e lançamentos. */
export async function linkArtistSpotify(artistId: string, spotifyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const taken = await db.query.artists.findFirst({ where: and(eq(artists.spotifyId, spotifyId), ne(artists.id, artistId)), columns: { name: true } });
  if (taken) return { ok: false, error: `Esse perfil do Spotify já está ligado ao artista ${taken.name}.` };
  const data = await fetchArtist(spotifyId);
  if (!data) return { ok: false, error: "Não foi possível ler esse artista no Spotify agora. Tente de novo." };
  await db.update(artists).set({ spotifyId, spotifyData: data, spotifySyncedAt: new Date(), spotifyUrl: data.url }).where(eq(artists.id, artistId));
  return { ok: true };
}

/** Atualiza os dados do Spotify se estiverem velhos. Falhas são ignoradas (fica o que já havia). */
export async function refreshArtistSpotify(a: { id: string; spotifyId: string | null; spotifySyncedAt: Date | null; spotifyData: SpotifyArtistData | null }) {
  if (!a.spotifyId) return;
  // ligados antes do "Sobre" existir (sem o campo about) atualizam já, sem esperar a semana
  const fresh = a.spotifySyncedAt && Date.now() - a.spotifySyncedAt.getTime() < SPOTIFY_TTL_MS;
  if (fresh && a.spotifyData && "about" in a.spotifyData) return;
  const data = await fetchArtist(a.spotifyId).catch(() => null);
  if (data) await db.update(artists).set({ spotifyData: data, spotifySyncedAt: new Date(), spotifyUrl: data.url }).where(eq(artists.id, a.id));
}

/** Quem pode ligar o artista ao Spotify: o dono de algum evento em que ele está no line-up. */
export async function canEditArtist(userId: string, artistId: string) {
  const [row] = await db
    .select({ id: eventArtists.artistId })
    .from(eventArtists)
    .innerJoin(events, eq(events.id, eventArtists.eventId))
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(and(eq(eventArtists.artistId, artistId), eq(organizers.ownerUserId, userId)))
    .limit(1);
  return !!row;
}
