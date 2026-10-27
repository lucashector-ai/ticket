import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FavoritesHydrator } from "@/components/favorites";
import { MeusIngressos } from "@/components/ingressos/meus-ingressos";
import type { TicketGroup, TicketItem } from "@/components/ingressos/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { getUserFavoriteSlugs, listUserTickets, type TicketWithEvent } from "@/lib/data/user";
import { countdownLabel, datePast, eventLabels } from "@/lib/tickets/labels";
import { ticketQrSvg } from "@/lib/tickets/qr";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus ingressos" };

/** Agrupa os ingressos por pedido (cada pedido é de um só evento): um "ingresso" do design com carrossel dos QR codes. */
async function groupTickets(rows: TicketWithEvent[], now: Date): Promise<TicketGroup[]> {
  const byOrder = new Map<string, TicketWithEvent[]>();
  for (const t of rows) {
    const k = `${t.orderId}:${t.eventId}`;
    const arr = byOrder.get(k);
    if (arr) arr.push(t); else byOrder.set(k, [t]);
  }
  const groups: TicketGroup[] = [];
  for (const [key, list] of byOrder) {
    // o ingresso do comprador vem primeiro; os demais em ordem de código
    const buyer = list[0].order?.buyerName ?? null;
    list.sort((a, b) => Number(b.holderName === buyer) - Number(a.holderName === buyer) || a.code.localeCompare(b.code));
    const e = list[0].event;
    const L = eventLabels(e);
    const tiers = Array.from(new Set(list.map((t) => t.ticketType.name)));
    const tickets: TicketItem[] = await Promise.all(list.map(async (t) => ({
      id: t.id, code: t.code, holderName: t.holderName, status: t.status, checkedInAt: t.checkedInAt?.toISOString() ?? null,
      qrSvg: await ticketQrSvg(t.code, t.secret),
    })));
    const end = e.endAt ?? e.startAt;
    groups.push({
      key, orderNumber: list[0].order?.number ?? null, eventSlug: e.slug, title: e.title, flyerId: e.flyerId,
      startAt: e.startAt.toISOString(), upcoming: end.getTime() >= now.getTime(), countdown: countdownLabel(e.startAt, now),
      dateFull: L.dateFull, dateNice: L.dateNice, datePast: datePast(e.startAt), doors: L.doors, venue: L.venue, addr: L.addr, city: L.city,
      tier: tiers.join(" + "), tickets,
    });
  }
  return groups;
}

export default async function MeusIngressosPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/meus-ingressos");
  const [{ pedido }, rows, favs] = await Promise.all([searchParams, listUserTickets(user.id), getUserFavoriteSlugs(user.id)]);
  const groups = await groupTickets(rows, new Date());
  const n = Number(pedido);
  const confirmedOrder = Number.isInteger(n) && groups.some((g) => g.orderNumber === n) ? n : null;

  return (
    <div className="pg-meus-ingressos">
      <FavoritesHydrator serverFavs={favs} loggedIn />
      <SiteHeader user={user} variant="default" activePath="/meus-ingressos" />
      <MeusIngressos groups={groups} confirmedOrder={confirmedOrder} />
      <SiteFooter />
    </div>
  );
}
