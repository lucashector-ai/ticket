import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesHydrator } from "@/components/favorites";
import { SiteFooter } from "@/components/site-footer";
import { EventoView } from "@/components/evento/evento-view";
import type { EventoData, LineupItem, OrganizerInfo, TierItem } from "@/components/evento/types";
import { getEventBySlug, listSimilarEvents, type EventDetail } from "@/lib/data/events";
import { getUserFavoriteSlugs, isFollowing } from "@/lib/data/user";
import { getSessionUser } from "@/lib/auth/server";
import { dateFull, initials, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  if (!ev) return { title: "Evento não encontrado" };
  return { title: ev.title, description: ev.tagline ?? ev.description ?? undefined };
}

/* Paleta do design (mesma do seed) usada nos gradientes das faixas do player mock. */
const PAL = ["#1E1E22", "#D3F55B", "#E9E7E0", "#2C55F5", "#FF4FD8", "#C4532B"];

function toData(e: EventDetail): EventoData {
  const venueName = e.venueNameOverride ?? e.venue?.name ?? "";
  const city = e.venue?.city.name ?? "";
  const uf = e.venue?.city.uf ?? "";
  const addr = e.addressLabel ?? e.venue?.address ?? [e.venue?.neighborhood, city && `${city} – ${uf}`].filter(Boolean).join(" · ");
  const mapsQuery = [venueName, e.venue?.address ?? addr].filter(Boolean).join(", ");
  const lineup: LineupItem[] = e.eventArtists.map((ea, i) => {
    const a = ea.artist;
    const pal = a.palette ?? { bg: PAL[i % 6], fg: "#FFFFFF", accent: PAL[(i + 1) % 6] };
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      time: e.timed ? ea.timeLabel : null,
      role: ea.role,
      initials: initials(a.name),
      grad: `radial-gradient(circle at 30% 25%, ${pal.accent} 0%, ${pal.bg} 70%)`,
      fg: pal.fg,
      tracks: (a.tracks ?? []).map((t, j) => ({ ...t, grad: `linear-gradient(135deg, ${PAL[(i + j) % 6]}, ${PAL[(i + j + 2) % 6]})` })),
    };
  });
  const organizer: OrganizerInfo | null = e.organizer
    ? { id: e.organizer.id, name: e.organizer.name, initials: e.organizer.initials ?? initials(e.organizer.name), bio: e.organizer.bio, verified: e.organizer.verified, email: e.organizer.contactEmail }
    : null;
  const tiers: TierItem[] = e.ticketTypes.map((t) => ({ id: t.id, name: t.name, note: t.note, priceCents: t.priceCents, status: t.status, available: Math.max(0, t.quantity - t.sold) }));
  const open = tiers.filter((t) => t.status === "open");
  const paragraphs = e.descriptionParagraphs?.length ? e.descriptionParagraphs : e.description ? [e.description] : [];
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    flyerId: e.flyerId,
    accentColor: e.accentColor ?? "#111111",
    bannerId: e.bannerId ?? e.flyerId,
    category: e.primaryCategoryLabel,
    dateFull: e.dateFullLabel ?? dateFull(e.startAt),
    startTime: timeLabel(e.startAt),
    timed: e.timed,
    doors: e.doorsLabel,
    venue: venueName,
    addr,
    city,
    uf,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    paragraphs,
    age: e.ageRating,
    halfPrice: e.halfPriceInfo,
    refund: e.refundPolicy,
    lineup,
    organizer,
    tiers,
    maxPerOrder: e.maxPerOrder,
    minPriceCents: open.length ? Math.min(...open.map((t) => t.priceCents)) : e.minPriceCents,
  };
}

export default async function EventoPage({ params }: Params) {
  const { slug } = await params;
  const [ev, user] = await Promise.all([getEventBySlug(slug), getSessionUser()]);
  if (!ev || ev.status === "draft") notFound();
  const [similar, serverFavs, following] = await Promise.all([
    listSimilarEvents(ev.id, ev.primaryCategoryLabel),
    getUserFavoriteSlugs(user?.id),
    ev.organizerId ? isFollowing(user?.id, "organizer", ev.organizerId) : Promise.resolve(false),
  ]);
  const data = toData(ev);
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-evento">
      <FavoritesHydrator serverFavs={serverFavs} loggedIn={!!user} />
      <EventoView e={data} user={headerUser} loggedIn={!!user} initialFollowing={following} similar={similar} />
      <SiteFooter />
    </div>
  );
}
