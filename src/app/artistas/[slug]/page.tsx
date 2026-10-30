import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { SiteFooter } from "@/components/site-footer";
import { ArtistaView, type ArtistaProps } from "@/components/artista/artista-view";
import { getSessionUser } from "@/lib/auth/server";
import { getArtistBySlug, listArtistShows, listSimilarArtists } from "@/lib/data/events";
import { countFollowers, isFollowing } from "@/lib/data/user";
import { dayNum, kLabel, monShort } from "@/lib/format";
import { canEditArtist, refreshArtistSpotify } from "@/lib/spotify-artists";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const DEFAULT_PALETTE = { bg: "#1E1E22", fg: "#EDFF3C", accent: "#EDFF3C" };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) return { title: "Artista não encontrado" };
  const first = (artist.bio ?? "").split(/\n\s*\n/)[0]?.trim();
  return {
    title: artist.name,
    description: first || `${artist.name} na Tickets Win: shows, faixas e próximas datas.`,
  };
}

function avatarGrad(p: { bg: string; fg: string; accent: string }) {
  return `radial-gradient(circle at 30% 25%, ${p.accent} 0%, ${p.bg} 70%)`;
}

export default async function ArtistaPage({ params }: Params) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  const [shows, similar, user] = await Promise.all([listArtistShows(artist), listSimilarArtists(artist), getSessionUser()]);
  const [following, canEdit, fans] = await Promise.all([isFollowing(user?.id, "artist", artist.id), user ? canEditArtist(user.id, artist.id) : false, countFollowers("artist", artist.id)]);
  // dados do Spotify com mais de uma semana: atualiza depois de responder (a próxima visita já vê)
  after(() => refreshArtistSpotify(artist));
  const sp = artist.spotifyId && artist.spotifyData ? artist.spotifyData : null;

  const palette = artist.palette ?? DEFAULT_PALETTE;
  const ownIds = new Set(artist.eventArtists.map((x) => x.event.id));
  const cols = [palette.bg, palette.accent, palette.fg];

  const props: ArtistaProps = {
    user: user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null,
    loggedIn: !!user,
    artistId: artist.id,
    slug: artist.slug,
    name: artist.name,
    genre: artist.genre ?? (sp?.genres[0] ? sp.genres[0].replace(/^./, (x) => x.toUpperCase()) : "Música"),
    city: [artist.cityName, artist.uf].filter(Boolean).join(", "),
    verified: artist.verified,
    listeners: artist.monthlyListeners ? `${kLabel(artist.monthlyListeners)} ouvintes mensais` : sp?.followers ? `${kLabel(sp.followers)} seguidores no Spotify` : null,
    palette,
    avatarGrad: avatarGrad(palette),
    bio: (artist.bio || sp?.about?.text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    bioSource: !artist.bio && sp?.about ? { name: sp.about.source, url: sp.about.url } : null,
    bioRaw: artist.bio ?? "",
    stats: { fans: kLabel(fans), shows: String(shows.length), cities: String(new Set(shows.map((e) => `${e.city}/${e.uf}`)).size) },
    links: {
      spotify: artist.spotifyUrl, youtube: artist.youtubeUrl, instagram: artist.instagramUrl, deezer: artist.deezerUrl,
    },
    tracks: (artist.tracks ?? []).map((t, j) => ({
      title: t.title, plays: t.plays.replace(/^-/, ""), duration: t.duration,
      grad: `linear-gradient(135deg, ${cols[j % 3]}, ${cols[(j + 2) % 3]})`,
    })),
    shows: shows.map((e) => ({
      slug: e.slug, title: e.title, venue: e.venue, city: [e.city, e.uf].filter(Boolean).join(", "),
      day: dayNum(e.startAt), mon: monShort(e.startAt), own: ownIds.has(e.id),
    })),
    similar: similar.map((a) => {
      const p = a.palette ?? DEFAULT_PALETTE;
      return { slug: a.slug, name: a.name, genre: a.genre ?? "Música", grad: avatarGrad(p), fg: p.fg, image: a.spotifyData?.image ?? a.imageUrl ?? null };
    }),
    following,
    canEdit,
    spotify: sp && artist.spotifyId ? { id: artist.spotifyId, url: sp.url, image: sp.image, genres: sp.genres, releases: sp.releases } : null,
    image: sp?.image ?? artist.imageUrl ?? null,
  };

  return (
    <div className="pg-artista" style={{ minHeight: "100vh", background: "#FFFFFF" }}>
      <ArtistaView {...props} />
      <SiteFooter />
    </div>
  );
}
