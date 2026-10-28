import "server-only";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { brl, dateFull, dateNice } from "@/lib/format";
import { eventLabels } from "@/lib/tickets/labels";
import type { Audience, Block, Design } from "./design";
import type { EvInfo, OrgInfo } from "./render";

const { events, orders, follows, eventSignups, userProfiles, emailUnsubscribes } = schema;

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br").replace(/\/$/, "");
/** Caminhos do site ficam relativos (/midia/...): o e-mail completa com o endereço do site, e o editor com o local. */
const rel = (u: string | null | undefined) => (!u ? null : u.startsWith("/") || /^https?:\/\//.test(u) ? u : null);
const uploaded = (id: string | null | undefined) => (id && id.startsWith("/midia/") ? id : null);

/** Quem envia: o produtor (página) ou o usuário que ainda não tem página. */
export type Sender = { orgId: string | null; userId: string };

export function orgInfo(org: { name: string; avatarUrl: string | null; instagram: string | null; whatsapp: string | null; website: string | null } | null, fallbackName: string): OrgInfo {
  return {
    name: org?.name ?? fallbackName,
    logo: rel(org?.avatarUrl),
    instagram: org?.instagram ?? "", whatsapp: org?.whatsapp ?? "", site: org?.website ?? "",
  };
}

/** Eventos usados nos blocos, já com tudo o que o e-mail mostra. */
export async function loadEvents(ids: string[]): Promise<Record<string, EvInfo>> {
  const uniq = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/.test(x)))];
  if (!uniq.length) return {};
  const rows = await db.query.events.findMany({
    where: inArray(events.id, uniq),
    with: {
      venue: { with: { city: true } },
      ticketTypes: { orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.priceCents)] },
      eventArtists: { with: { artist: { columns: { name: true, imageUrl: true } } }, orderBy: (x, { asc }) => [asc(x.sortOrder)] },
    },
  });
  const out: Record<string, EvInfo> = {};
  for (const e of rows) {
    const L = eventLabels(e);
    const open = e.ticketTypes.filter((t) => t.status === "open" && (t.quantity === 0 || t.sold < t.quantity));
    const min = open.length ? Math.min(...open.map((t) => t.priceCents)) : null;
    // mesmo ingresso em várias datas aparece uma vez, com o menor preço
    const tiers = new Map<string, { name: string; cents: number; soldOut: boolean }>();
    for (const t of e.ticketTypes) {
      if (t.status === "closed") continue;
      const name = [t.sector, t.name].filter(Boolean).join(" · ");
      const soldOut = t.status === "sold_out" || (t.quantity > 0 && t.sold >= t.quantity);
      const x = tiers.get(name);
      if (!x) tiers.set(name, { name, cents: t.priceCents, soldOut });
      else { x.cents = Math.min(x.cents, t.priceCents); x.soldOut = x.soldOut && soldOut; }
    }
    const addr = [e.venue?.address, L.addr].filter(Boolean).join(" · ");
    const q = [L.venue, e.venue?.address, e.venue?.city.name].filter(Boolean).join(", ");
    out[e.id] = {
      id: e.id, slug: e.slug, title: e.title, url: `/eventos/${e.slug}`,
      whenShort: e.dateLabel ?? dateNice(e.startAt), when: e.dateFullLabel ?? dateFull(e.startAt),
      venue: L.venue, city: [e.venue?.city.name, e.venue?.city.uf].filter(Boolean).join(" – "), address: addr,
      mapsUrl: q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "",
      banner: uploaded(e.bannerId) ?? rel(e.media?.share ?? null), flyer: uploaded(e.flyerId) ?? rel(e.media?.home ?? null),
      accent: e.accentColor && /^#[0-9a-f]{6}$/i.test(e.accentColor) ? e.accentColor : "#111111",
      minPrice: min === null ? null : min === 0 ? "Grátis" : brl(min),
      lineup: e.eventArtists.slice(0, 12).map((x) => ({ name: x.artist.name, img: rel(x.artist.imageUrl), role: x.role ?? "" })),
      tiers: [...tiers.values()].map((t) => ({ name: t.name, price: t.cents === 0 ? "Grátis" : brl(t.cents), soldOut: t.soldOut })),
      startAt: e.startAt.getTime(),
    };
  }
  return out;
}

/** Eventos futuros e publicados do produtor (para o bloco Agenda), do mais próximo ao mais distante. */
export async function upcomingIds(s: Sender, now = new Date()) {
  const rows = await db.select({ id: events.id }).from(events)
    .where(and(s.orgId ? or(eq(events.organizerId, s.orgId), eq(events.createdByUserId, s.userId)) : eq(events.createdByUserId, s.userId), eq(events.status, "published"), eq(events.unlisted, false), gt(sql`coalesce(${events.endAt}, ${events.startAt})`, now)))
    .orderBy(events.startAt).limit(12);
  return rows.map((r) => r.id);
}

export function designEventIds(d: Design) {
  const ids: string[] = [];
  for (const b of d.blocks as Block[]) {
    if ("eventId" in b && b.eventId) ids.push(b.eventId);
    if (b.t === "eventos" && b.mode === "escolhidos") ids.push(...b.eventIds);
    if ((b.t === "botao" || b.t === "imagem") && b.href.startsWith("evento:")) ids.push(b.href.slice(7));
  }
  return ids;
}

/** Busca um evento publicado de qualquer produtor (bloco de evento parceiro). */
export async function searchPublicEvents(q: string, limit = 8) {
  const term = `%${q.trim().replace(/[%_]/g, "")}%`;
  if (q.trim().length < 2) return [];
  return db.select({ id: events.id, title: events.title, startAt: events.startAt }).from(events)
    .where(and(eq(events.status, "published"), eq(events.unlisted, false), sql`${events.title} ilike ${term}`, gt(sql`coalesce(${events.endAt}, ${events.startAt})`, new Date())))
    .orderBy(events.startAt).limit(limit);
}

/* ---------- público ---------- */

export type Recipient = { email: string; name: string };
const okEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Lista final da campanha: junta as fontes, tira repetidos, exclusões e quem se descadastrou. */
export async function resolveAudience(a: Audience, s: Sender, ownEventIds: string[]): Promise<Recipient[]> {
  const own = new Set(ownEventIds);
  const by = new Map<string, Recipient>();
  const add = (email: string | null | undefined, name: string | null | undefined) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!okEmail(e)) return;
    const cur = by.get(e);
    if (!cur) by.set(e, { email: e, name: (name ?? "").trim() });
    else if (!cur.name && name) cur.name = name.trim();
  };

  const buyerIds = a.buyers === "all" ? [...own] : a.buyers === "events" ? a.buyerEvents.filter((id) => own.has(id)) : [];
  if (buyerIds.length) {
    const rows = await db.selectDistinct({ email: orders.buyerEmail, name: orders.buyerName }).from(orders)
      .where(and(inArray(orders.eventId, buyerIds), eq(orders.status, "paid")));
    for (const r of rows) add(r.email, r.name);
  }
  if (a.followers && s.orgId) {
    const rows = await db.select({ email: userProfiles.email, name: userProfiles.name }).from(follows)
      .innerJoin(userProfiles, eq(userProfiles.userId, follows.userId))
      .where(and(eq(follows.targetType, "organizer"), eq(follows.targetId, s.orgId)));
    for (const r of rows) add(r.email, r.name);
  }
  if (a.signups && own.size) {
    const rows = await db.selectDistinct({ email: eventSignups.email }).from(eventSignups).where(inArray(eventSignups.eventId, [...own]));
    for (const r of rows) add(r.email, null);
  }

  const exclude = a.excludeBuyersOf.filter((id) => own.has(id) || /^[0-9a-f-]{36}$/.test(id));
  if (exclude.length && by.size) {
    const rows = await db.selectDistinct({ email: orders.buyerEmail }).from(orders).where(and(inArray(orders.eventId, exclude), eq(orders.status, "paid")));
    for (const r of rows) by.delete((r.email ?? "").toLowerCase());
  }
  if (by.size) {
    // descadastro de todos (sem produtor), deste produtor, ou deste remetente sem página
    const unsub = await db.select({ email: emailUnsubscribes.email }).from(emailUnsubscribes).where(or(
      and(isNull(emailUnsubscribes.organizerId), isNull(emailUnsubscribes.senderUserId)),
      s.orgId ? eq(emailUnsubscribes.organizerId, s.orgId) : sql`false`,
      eq(emailUnsubscribes.senderUserId, s.userId),
    ));
    for (const r of unsub) by.delete(r.email.toLowerCase());
  }
  return [...by.values()];
}

/** Total de contatos que o produtor pode alcançar (todas as fontes, sem exclusões). */
export async function reachable(s: Sender, ownEventIds: string[]) {
  return (await resolveAudience({ buyers: "all", buyerEvents: [], followers: true, signups: true, excludeBuyersOf: [] }, s, ownEventIds)).length;
}


/* ---------- números das campanhas ---------- */

export type CampaignStats = { total: number; queued: number; sent: number; failed: number; opened: number; clicked: number; unsub: number };
const ZERO: CampaignStats = { total: 0, queued: 0, sent: 0, failed: 0, opened: 0, clicked: 0, unsub: 0 };

export async function campaignStats(ids: string[]) {
  const m = new Map<string, CampaignStats>();
  if (!ids.length) return m;
  const s = schema.emailSends;
  const rows = await db.select({
    id: s.campaignId,
    total: sql<number>`count(*)::int`,
    queued: sql<number>`count(*) filter (where ${s.status} = 'queued')::int`,
    sent: sql<number>`count(*) filter (where ${s.status} = 'sent')::int`,
    failed: sql<number>`count(*) filter (where ${s.status} = 'failed')::int`,
    opened: sql<number>`count(${s.openedAt})::int`,
    clicked: sql<number>`count(${s.clickedAt})::int`,
    unsub: sql<number>`count(${s.unsubscribedAt})::int`,
  }).from(s).where(inArray(s.campaignId, ids)).groupBy(s.campaignId);
  for (const r of rows) m.set(r.id, { ...ZERO, ...r });
  return m;
}
export const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0).replace(".", ",")}%` : "—");
