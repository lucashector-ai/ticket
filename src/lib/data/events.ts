import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { events, venues, cities, organizers, ticketTypes, eventArtists, artists, categories, eventCategories } = schema;

export type EventCard = {
  id: string; slug: string; title: string; flyerId: string; bannerId: string | null;
  startAt: Date; endAt: Date | null; dateLabel: string | null; dateNice: string;
  venue: string; city: string; uf: string; minPriceCents: number; popularity: number;
  kinds: string[]; categoryLabel: string | null; accentColor: string | null; tagline: string | null;
  lineup: string[];
};

function toCard(e: typeof events.$inferSelect & { venue: { name: string; city: { name: string; uf: string } } | null; eventArtists: { artist: { name: string } }[] }): EventCard {
  return {
    id: e.id, slug: e.slug, title: e.title, flyerId: e.flyerId, bannerId: e.bannerId,
    startAt: e.startAt, endAt: e.endAt, dateLabel: e.dateLabel, dateNice: e.dateLabel ?? "",
    venue: e.venueNameOverride ?? e.venue?.name ?? "", city: e.venue?.city.name ?? "", uf: e.venue?.city.uf ?? "",
    minPriceCents: e.minPriceCents, popularity: e.popularity, kinds: e.kinds, categoryLabel: e.primaryCategoryLabel,
    accentColor: e.accentColor, tagline: e.tagline, lineup: e.eventArtists.map((x) => x.artist.name),
  };
}

const cardWith = {
  venue: { with: { city: true as const } },
  eventArtists: { with: { artist: true as const }, orderBy: [asc(eventArtists.sortOrder)] },
};

/** Eventos publicados que ainda não terminaram. */
export async function listLiveEvents(): Promise<EventCard[]> {
  const rows = await db.query.events.findMany({
    where: and(eq(events.status, "published"), eq(events.unlisted, false), gte(sql`coalesce(${events.endAt}, ${events.startAt})`, sql`now()`)),
    with: cardWith,
    orderBy: [asc(events.startAt)],
  });
  return rows.map(toCard);
}

export async function listHeroEvents(): Promise<EventCard[]> {
  const rows = await db.query.events.findMany({
    where: and(eq(events.status, "published"), eq(events.unlisted, false), sql`${events.heroOrder} is not null`),
    with: cardWith,
    orderBy: [asc(events.heroOrder)],
  });
  return rows.map(toCard);
}

export async function listCategories() {
  return db.query.categories.findMany({ orderBy: [asc(categories.sortOrder)] });
}

export async function listCities() {
  return db.query.cities.findMany({ orderBy: [asc(cities.name)] });
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;

export async function getEventBySlug(slug: string) {
  const e = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      venue: { with: { city: true } },
      organizer: true,
      ticketTypes: { orderBy: [asc(ticketTypes.sortOrder)] },
      sessions: { with: { venue: { with: { city: true } } } },
      eventArtists: { with: { artist: true }, orderBy: [asc(eventArtists.sortOrder)] },
      eventCategories: { with: { category: true } },
    },
  });
  return e ?? null;
}

/** Eventos parecidos: mesma categoria principal primeiro, depois os demais ao vivo. */
export async function listSimilarEvents(eventId: string, categoryLabel: string | null, limit = 4): Promise<EventCard[]> {
  const live = await listLiveEvents();
  const others = live.filter((e) => e.id !== eventId);
  const same = others.filter((e) => e.categoryLabel === categoryLabel);
  const rest = others.filter((e) => e.categoryLabel !== categoryLabel);
  return [...same, ...rest].slice(0, limit);
}

export async function listEventsByOrganizer(organizerId: string): Promise<EventCard[]> {
  const rows = await db.query.events.findMany({ where: and(eq(events.organizerId, organizerId), eq(events.status, "published"), eq(events.unlisted, false)), with: cardWith, orderBy: [asc(events.startAt)] });
  return rows.map(toCard);
}

export async function listEventsByIds(ids: string[]): Promise<EventCard[]> {
  if (!ids.length) return [];
  const rows = await db.query.events.findMany({ where: inArray(events.id, ids), with: cardWith, orderBy: [asc(events.startAt)] });
  return rows.map(toCard);
}

export async function listEventsBySlugs(slugs: string[]): Promise<EventCard[]> {
  if (!slugs.length) return [];
  const rows = await db.query.events.findMany({ where: inArray(events.slug, slugs), with: cardWith, orderBy: [asc(events.startAt)] });
  return rows.map(toCard);
}

export async function getOrganizerBySlug(slug: string) {
  return db.query.organizers.findFirst({ where: eq(organizers.slug, slug) }) ?? null;
}

export type ArtistDetail = NonNullable<Awaited<ReturnType<typeof getArtistBySlug>>>;

export async function getArtistBySlug(slug: string) {
  const a = await db.query.artists.findFirst({
    where: eq(artists.slug, slug),
    with: { eventArtists: { with: { event: { with: { venue: { with: { city: true } } } } } } },
  });
  return a ?? null;
}

/** Próximos shows do artista: só eventos em que ele está no line-up. */
export async function listArtistShows(artist: ArtistDetail, limit = 8): Promise<EventCard[]> {
  const own = new Set(artist.eventArtists.map((x) => x.event.id));
  const live = await listLiveEvents();
  return live.filter((e) => own.has(e.id)).slice(0, limit);
}

/** Parecidos: primeiro quem divide gêneros do Spotify, depois o mesmo gênero. */
export async function listSimilarArtists(artist: ArtistDetail, limit = 6) {
  const all = await db.query.artists.findMany({ orderBy: [desc(artists.monthlyListeners)] });
  const mine = new Set(artist.spotifyData?.genres ?? []);
  const score = (a: (typeof all)[number]) =>
    (a.spotifyData?.genres ?? []).filter((g) => mine.has(g)).length * 10 + (a.genre === artist.genre ? 1 : 0) + (a.spotifyData?.image ? 0.5 : 0);
  return all
    .filter((a) => a.id !== artist.id && !/^\d/.test(a.name))
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.a);
}

export async function listAllArtists() {
  return db.query.artists.findMany({ orderBy: [asc(artists.name)] });
}

export type SearchFilters = { q?: string; city?: string; cat?: string; date?: "any" | "hoje" | "semana" | "fds" | "p30"; sort?: "data" | "pop" | "preco"; maxPrice?: number };

export async function searchEvents(f: SearchFilters): Promise<EventCard[]> {
  const live = await listLiveEvents();
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const now = new Date();
  const DAY = 86_400_000;
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const dow = t0.getDay();
  const sunEnd = t0.getTime() + ((7 - dow) % 7) * DAY + DAY - 1;
  const fds = dow === 5 || dow === 6 || dow === 0 ? t0.getTime() : t0.getTime() + (5 - dow) * DAY;
  const ranges: Record<string, [number, number]> = { hoje: [t0.getTime(), t0.getTime() + DAY - 1], semana: [t0.getTime(), sunEnd], fds: [fds, sunEnd], p30: [t0.getTime(), t0.getTime() + 30 * DAY] };
  let list = live.filter((e) => {
    if (f.city && f.city !== "all" && e.city !== f.city) return false;
    if (f.cat && f.cat !== "all" && !e.kinds.includes(f.cat)) return false;
    if (f.date && f.date !== "any") {
      const r = ranges[f.date];
      const s = e.startAt.getTime(), en = (e.endAt ?? e.startAt).getTime();
      if (!(s <= r[1] && en >= r[0])) return false;
    }
    if (f.maxPrice != null && e.minPriceCents > f.maxPrice * 100) return false;
    if (f.q) {
      const hay = norm([e.title, e.venue, e.city, e.uf, e.lineup.join(" ")].join(" "));
      if (!norm(f.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  if (f.sort === "pop") list = list.sort((a, b) => b.popularity - a.popularity);
  else if (f.sort === "preco") list = list.sort((a, b) => a.minPriceCents - b.minPriceCents);
  else list = list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return list;
}

export { eventCategories, venues, cities, organizers };
