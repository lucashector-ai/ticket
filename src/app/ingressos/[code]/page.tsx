import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FavoritesHydrator } from "@/components/favorites";
import { TicketView, type TicketViewData } from "@/components/ingressos/ticket-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { getUserFavoriteSlugs } from "@/lib/data/user";
import { dateNice } from "@/lib/format";
import { countdownLabel, eventLabels } from "@/lib/tickets/labels";
import { ticketQrSvg } from "@/lib/tickets/qr";
import { ticketCard } from "@/lib/tickets/card";
import { appleWalletEnabled } from "@/lib/wallet/apple";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { resaleCap } from "@/lib/resale";
import { googleWalletEnabled } from "@/lib/wallet/google";

export const dynamic = "force-dynamic";

const CODE_RE = /^(TW|ONDE)-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Ingresso ${code.toUpperCase()}` };
}

export default async function IngressoPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ revender?: string }> }) {
  const [{ code: raw }, { revender }] = await Promise.all([params, searchParams]);
  const code = raw.toUpperCase();
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`);
  if (!CODE_RE.test(code)) notFound();
  const [t, favs] = await Promise.all([getTicketByCode(code), getUserFavoriteSlugs(user.id)]);
  // Só o titular vê o ingresso; para os demais é como se não existisse.
  if (!t || t.holderUserId !== user.id) notFound();

  const now = new Date();
  const e = t.event;
  const listing = await db.query.resaleListings.findFirst({ where: and(eq(schema.resaleListings.ticketId, t.id), inArray(schema.resaleListings.status, ["active", "reserved"])) });
  // os outros ingressos deste evento na mesma conta entram na pilha (o atual no meio deles, por código)
  const siblings = await db.query.tickets.findMany({
    where: and(eq(schema.tickets.eventId, t.eventId), eq(schema.tickets.holderUserId, user.id), inArray(schema.tickets.status, ["valid", "used", "transferred"])),
    columns: { code: true, holderName: true }, orderBy: (x, { asc }) => [asc(x.code)],
  });
  const pending = t.status === "transferred" ? await db.query.ticketTransfers.findFirst({ where: and(eq(schema.ticketTransfers.ticketId, t.id), eq(schema.ticketTransfers.status, "pending")), columns: { toEmail: true } }) : null;
  const L = eventLabels(e);
  const data: TicketViewData = {
    wallet: { apple: appleWalletEnabled(), google: googleWalletEnabled() },
    ticket: { id: t.id, code: t.code, holderName: t.holderName, status: t.status, checkedInAt: t.checkedInAt?.toISOString() ?? null, qrSvg: await ticketQrSvg(t.code, t.secret) },
    eventSlug: e.slug, title: e.title, flyerId: e.flyerId,
    upcoming: (e.endAt ?? e.startAt).getTime() >= now.getTime(), countdown: countdownLabel(e.startAt, now),
    dateFull: L.dateFull, dateNice: L.dateNice, doors: L.doors, venue: L.venue, addr: L.addr,
    tier: t.ticketType.name, orderNumber: t.order?.number ?? null,
    checkedInLabel: t.checkedInAt ? dateNice(t.checkedInAt) : null,
    transferEnabled: e.transferEnabled,
    pendingTo: pending?.toEmail ?? null,
    siblings: siblings.map((s) => ({ code: s.code, holder: s.holderName })),
    card: ticketCard(t, e),
    resale: { enabled: e.resaleEnabled && e.status === "published" && t.ticketType.priceCents > 0, ...resaleCap(t.ticketType.priceCents, t.halfPrice, e.resaleMaxPct), listing: listing ? { id: listing.id, priceCents: listing.priceCents, reserved: listing.status === "reserved" && !!listing.reservedUntil && listing.reservedUntil > now } : null },
  };

  data.openResale = revender === "1" && data.resale.enabled && !data.resale.listing && t.status === "valid";
  return (
    <div className="pg-meus-ingressos">
      <FavoritesHydrator serverFavs={favs} loggedIn />
      <SiteHeader user={user} variant="default" activePath="/meus-ingressos" />
      <TicketView data={data} />
      <SiteFooter />
    </div>
  );
}
