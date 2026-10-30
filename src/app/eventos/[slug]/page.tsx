import type { Metadata } from "next";
import { deadlineOpen, EVENT_RULES, policyOf, policyText } from "@/lib/refund-policy";
import { DEFAULT_TEASER, isDefaultRefund } from "@/lib/criar/model";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { EventoView } from "@/components/evento/evento-view";
import type { EventoData, LineupItem, OrganizerInfo, SessionItem, TierItem } from "@/components/evento/types";
import { getEventBySlug, listSimilarEvents, type EventDetail } from "@/lib/data/events";
import { isFollowing } from "@/lib/data/user";
import { canEditEvent } from "@/lib/data/org-access";
import { getSessionUser } from "@/lib/auth/server";
import { dateFull, hourLabel, initials, parts, timeLabel } from "@/lib/format";
import { salesStartNote, tierStatus } from "@/lib/tickets/status";
import { presaleAccess, salePhase } from "@/lib/launch";
import { heldByType } from "@/lib/holds";
import { groupKey, meiaLeftByGroup } from "@/lib/meia-quota";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { artVersion, eventShareArt } from "@/lib/share-image";
import { boughtByType, type Bought } from "@/lib/payments/fulfill";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  if (!ev) return { title: "Evento não encontrado" };
  const description = ev.tagline ?? ev.description?.slice(0, 200) ?? undefined;
  // prévia do link (WhatsApp etc.): a arte do evento em JPG leve
  const art = eventShareArt(ev);
  const image = art ? { url: `/api/og/evento/${slug}?v=${artVersion(art.src)}`, ...(art.wide ? { width: 1200, height: 630 } : {}), alt: ev.title } : null;
  return {
    title: ev.title,
    description,
    openGraph: { title: `${ev.title} · Tickets Win`, description, url: `/eventos/${slug}`, type: "website", siteName: "Tickets Win", locale: "pt_BR", ...(image ? { images: [image] } : {}) },
    twitter: { card: image?.width ? "summary_large_image" : "summary", title: ev.title, description, ...(image ? { images: [image.url] } : {}) },
  };
}

/** Ingressos de cada tipo que quem está vendo já comprou (pela conta e pelo CPF do perfil). */
async function viewerBought(userId: string, typeIds: string[]): Promise<Bought> {
  const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, userId), columns: { cpf: true } });
  return boughtByType(userId, p?.cpf ?? null, typeIds);
}

/* Paleta do design (mesma do seed) usada nos gradientes das faixas do player mock. */
const PAL = ["#1E1E22", "#EDFF3C", "#E9E7E0", "#2C55F5", "#FF4FD8", "#C4532B"];

type Offer = { id: string; ticketTypeId: string; priceCents: number; sellerUserId: string };
function toData(e: EventDetail, access: boolean, held: Map<string, number>, offers: Offer[], viewerId: string | null, bought: Bought, meiaLeft: Map<string, number>): EventoData {
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
      image: a.spotifyData?.image ?? a.imageUrl ?? null,
      spotify: !!a.spotifyId,
      grad: `radial-gradient(circle at 30% 25%, ${pal.accent} 0%, ${pal.bg} 70%)`,
      fg: pal.fg,
      tracks: (a.tracks ?? []).map((t, j) => ({ ...t, grad: `linear-gradient(135deg, ${PAL[(i + j) % 6]}, ${PAL[(i + j + 2) % 6]})` })),
    };
  });
  const organizer: OrganizerInfo | null = e.organizer
    ? { id: e.organizer.id, slug: e.organizer.slug, avatarUrl: e.organizer.avatarUrl, name: e.organizer.name, initials: e.organizer.initials ?? initials(e.organizer.name), bio: e.organizer.bio, verified: e.organizer.verified, email: e.organizer.contactEmail }
    : null;
  const tiers: TierItem[] = e.ticketTypes.map((t) => {
    // evento cancelado: nenhum ingresso à venda
    const status = e.status === "cancelled" ? "closed" : tierStatus(t);
    return {
      id: t.id, name: t.name, note: status === "upcoming" && t.salesStart ? salesStartNote(t.salesStart) : t.note, desc: t.description,
      priceCents: t.priceCents, limit: Math.min(t.maxPerOrder, e.maxPerOrder), status,
      // tipo Meia: também limitado pela cota de meia do setor (40% dos lugares do setor e data)
      available: Math.max(0, Math.min(t.quantity - t.sold - (held.get(t.id) ?? 0), t.kind === "meia" ? meiaLeft.get(groupKey(t)) ?? Infinity : Infinity)),
      // limite por pessoa já usado em compras pagas (conta e CPF), a mesma conta que o checkout faz
      owned: bought.get(t.id)?.all ?? 0,
      sector: t.sector, sectorColor: t.sectorColor, sessionId: t.sessionId,
      // cota de meia do setor e data, somada entre os tipos Meia do mesmo grupo (texto "esgotada neste setor")
      ...(t.kind === "meia" ? { meiaGroup: groupKey(t), meiaLeft: meiaLeft.get(groupKey(t)) ?? null } : {}),
    };
  });
  const plan = e.ticketMode === "mapa" && e.venueMap?.plan?.areas?.length ? e.venueMap.plan : null;
  const venueMap: EventoData["venueMap"] = plan
    ? { width: plan.width, depth: plan.depth, floor: plan.floor, areas: plan.areas.map(({ id, name, kind, x, y, w, d, h, sectorName, color }) => ({ id, name, kind, x, y, w, d, h, sectorName, color })) }
    : null;
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], MS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const sessions: SessionItem[] = e.sessions.length > 1
    ? [...e.sessions].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((s) => {
      const p = parts(s.startAt);
      const sub = e.format === "turne" && s.venue ? s.venue.city.name : hourLabel(s.startAt);
      return { id: s.id, wd: WD[p.wd], day: `${p.d} ${MS[p.m - 1]}`, sub };
    })
    : [];
  // "a partir de" só com o que ainda dá para comprar (sem a Meia de um setor com a cota esgotada)
  const open = tiers.filter((t) => t.status === "open" && t.available > 0);
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
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}${e.venue?.placeId ? `&query_place_id=${encodeURIComponent(e.venue.placeId)}` : ""}`,
    paragraphs,
    age: e.ageRating,
    halfPrice: e.halfPriceInfo,
    // política estruturada (painel → Cancelamentos e reembolsos) + o texto livre do produtor, se houver
    refund: e.status === "cancelled" ? "Evento cancelado pelo produtor. Quem comprou recebe o reembolso integral, com a taxa de serviço, automaticamente." : [policyText(policyOf(e)), e.refundPolicy?.trim() && !isDefaultRefund(e.refundPolicy) ? `Observação do produtor: ${e.refundPolicy.trim()}` : null, EVENT_RULES].filter(Boolean).join(" "),
    lineup,
    organizer,
    tiers,
    sessions,
    venueMap,
    maxPerOrder: e.maxPerOrder,
    feeRate: e.absorbFee ? 0 : SERVICE_FEE_RATE,
    queueOn: e.queueMode !== "off",
    resale: {
      offers: e.resaleEnabled && e.status === "published" && deadlineOpen(e.startAt, e.resaleUntilHours) ? offers.flatMap((o) => {
        const t = e.ticketTypes.find((x) => x.id === o.ticketTypeId);
        if (!t) return [];
        const s = t.sessionId ? sessions.find((x) => x.id === t.sessionId) : null;
        return [{
          id: o.id, label: [t.sector, t.name].filter(Boolean).join(" · "), color: t.sectorColor, session: s ? `${s.wd}, ${s.day}` : null,
          priceCents: o.priceCents, totalCents: o.priceCents + (e.absorbFee ? 0 : Math.round(o.priceCents * SERVICE_FEE_RATE)), mine: o.sellerUserId === viewerId,
        }];
      }) : [],
    },
    launch: { phase: salePhase(e), openAt: e.salesOpenAt?.toISOString() ?? null, presaleAt: e.presaleAt?.toISOString() ?? null, access, page: { ...DEFAULT_TEASER, ...e.launchPage } },
    minPriceCents: open.length ? Math.min(...open.map((t) => t.priceCents)) : e.minPriceCents,
  };
}

export default async function EventoPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const [ev, user] = await Promise.all([getEventBySlug(slug), getSessionUser()]);
  // rascunho: só quem pode editar vê a prévia (quem criou, o dono e os admins da produtora)
  if (!ev || (ev.status === "draft" && !(user && (ev.createdByUserId === user.id || (await canEditEvent(user.id, ev)))))) notFound();
  // tudo o que depende só do evento e de quem vê sai numa rodada só (antes eram três, uma depois da outra)
  const [similar, following, access, offers, held, bought, meiaLeft] = await Promise.all([
    listSimilarEvents(ev.id, ev.primaryCategoryLabel),
    ev.organizerId ? isFollowing(user?.id, "organizer", ev.organizerId) : Promise.resolve(false),
    salePhase(ev) === "presale" ? presaleAccess(ev.id).then((a) => !!a) : Promise.resolve(false),
    db.select({ id: schema.resaleListings.id, ticketTypeId: schema.resaleListings.ticketTypeId, priceCents: schema.resaleListings.priceCents, sellerUserId: schema.resaleListings.sellerUserId })
      .from(schema.resaleListings)
      .where(and(eq(schema.resaleListings.eventId, ev.id), or(eq(schema.resaleListings.status, "active"), and(eq(schema.resaleListings.status, "reserved"), lt(schema.resaleListings.reservedUntil, new Date())))))
      .orderBy(asc(schema.resaleListings.priceCents)),
    // a reserva de quem está vendo (pedido aberto dele) não tira lugar dele mesmo
    heldByType(ev.id, { exceptUserId: user?.id }),
    user ? viewerBought(user.id, ev.ticketTypes.map((t) => t.id)) : Promise.resolve<Bought>(new Map()),
    meiaLeftByGroup(ev.id, ev.ticketTypes),
  ]);
  const data = toData(ev, access, held, offers, user?.id ?? null, bought, meiaLeft);
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-evento">
      <EventoView e={data} user={headerUser} loggedIn={!!user} initialFollowing={following} similar={similar} viewerEmail={user?.email ?? ""} initialItens={one("itens")} openBuy={one("comprar") === "1"} />
      <SiteFooter />
    </div>
  );
}
