import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MeusIngressos } from "@/components/ingressos/meus-ingressos";
import { appleWalletEnabled } from "@/lib/wallet/apple";
import { googleWalletEnabled } from "@/lib/wallet/google";
import type { IncomingView, PendingOrderView, SentView, TicketGroup, TicketItem } from "@/components/ingressos/types";
import type { ListTicket } from "@/components/ingressos/meus-ingressos";
import QRCode from "qrcode";
import { companionsLabel, guestQrPayload, listTicketsForEmail } from "@/lib/guest-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { listUserTickets, type TicketWithEvent } from "@/lib/data/user";
import { listIncomingTransfers, listSentTransfers } from "@/lib/data/envios";
import { listPendingOrders } from "@/lib/payments/pending";
import { countdownLabel, datePast, eventLabels } from "@/lib/tickets/labels";
import { ticketQrSvg } from "@/lib/tickets/qr";
import { dateNice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus ingressos" };

/** Já usado, cancelado ou reembolsado: vai para "Anteriores" mesmo antes do evento acabar. */
const finished = (t: TicketWithEvent) => t.status === "used" || t.status === "cancelled" || t.status === "refunded";

/** Agrupa os ingressos por evento (todas as compras juntas): um "ingresso" do design com carrossel dos QR codes.
 *  Os já utilizados formam um grupo à parte, que aparece em Anteriores. */
async function groupTickets(rows: TicketWithEvent[], now: Date, sentOf: Map<string, NonNullable<TicketItem["sentTo"]>>): Promise<TicketGroup[]> {
  const byOrder = new Map<string, TicketWithEvent[]>();
  for (const t of rows) {
    const k = `${t.eventId}:${finished(t) ? "fim" : "ativo"}`;
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
      sentTo: t.status === "transferred" ? sentOf.get(t.id) ?? null : null,
    })));
    const end = e.endAt ?? e.startAt;
    const ended = end.getTime() < now.getTime();
    const orders = [...new Set(list.map((t) => t.order?.number).filter((n): n is number => n != null))];
    groups.push({
      key, orderNumber: orders.length === 1 ? orders[0] : null, orderNumbers: orders, ended, eventSlug: e.slug, title: e.title, flyerId: e.flyerId,
      startAt: e.startAt.toISOString(), upcoming: !ended && !list.every(finished), countdown: countdownLabel(e.startAt, now),
      dateFull: L.dateFull, dateNice: L.dateNice, datePast: datePast(e.startAt), doors: L.doors, venue: L.venue, addr: L.addr, city: L.city,
      tier: tiers.join(" + "), resale: e.resaleEnabled && list.some((t) => t.ticketType.priceCents > 0), transfer: e.transferEnabled, tickets,
    });
  }
  return groups;
}

export default async function MeusIngressosPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/meus-ingressos");
  const [{ pedido }, rows, guestRows, pendingRows, sentRows, incomingRows] = await Promise.all([
    searchParams, listUserTickets(user.id), listTicketsForEmail(user.email, !!user.emailVerified),
    listPendingOrders(user.id), listSentTransfers(user.id), listIncomingTransfers(user.email, !!user.emailVerified),
  ]);
  const now = new Date();
  const sentOf = new Map(sentRows.filter((r) => r.status === "pending").map((r) => [r.ticketId, { transferId: r.id, email: r.toEmail, gift: r.kind === "gift" }]));
  const groups = await groupTickets(rows, now, sentOf);
  // pedidos não pagos dentro da reserva: dá para pagar (retoma o mesmo pedido) ou cancelar
  const pending: PendingOrderView[] = pendingRows.map((o) => {
    const L = eventLabels(o.event);
    return {
      id: o.id, number: o.number ?? 0, title: o.event.title, flyerId: o.event.flyerId, dateNice: L.dateNice, venue: L.venue,
      items: o.items.map((i) => `${i.quantity}× ${i.ticketType.sector ? `${i.ticketType.sector} · ${i.ticketType.name}` : i.ticketType.name}`).join(", "),
      totalCents: o.totalCents, method: o.paymentMethod === "card" || o.paymentMethod === "free" ? o.paymentMethod : "pix",
      secondsLeft: Math.max(0, Math.round(((o.expiresAt?.getTime() ?? 0) - now.getTime()) / 1000)),
    };
  });
  const sent: SentView[] = sentRows.map((r) => ({
    id: r.id, ticketId: r.ticketId, toEmail: r.toEmail, status: r.status === "accepted" ? "accepted" : "pending", gift: r.kind === "gift",
    holderName: r.holderName, tier: r.tier + (r.halfPrice ? " · meia" : ""), eventTitle: r.eventTitle,
  }));
  const incoming: IncomingView[] = incomingRows.map((r) => ({
    token: r.token, title: r.eventTitle, flyerId: r.flyerId, dateNice: r.dateLabel ?? dateNice(r.startAt), venue: "",
    tier: r.tier + (r.halfPrice ? " · meia" : ""), holderName: r.holderName, gift: r.kind === "gift",
  }));
  // ingressos de lista free do e-mail da conta (sem pedido: só o QR da lista)
  const lists: ListTicket[] = await Promise.all(guestRows.map(async (g) => {
    const L = eventLabels(g.event);
    return {
      token: g.token, title: g.event.title, flyerId: g.event.flyerId, dateNice: L.dateNice, venue: L.venue, city: L.city, startAt: g.event.startAt.toISOString(),
      name: g.name, plus: companionsLabel(g.guests), inAt: g.checkedInAt?.toISOString() ?? null,
      qrSvg: await QRCode.toString(guestQrPayload(g.token), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffff00" } }),
    };
  })).then((l) => l.sort((a, b) => a.startAt.localeCompare(b.startAt)));
  const n = Number(pedido);
  const confirmedOrder = Number.isInteger(n) && groups.some((g) => g.orderNumbers.includes(n)) ? n : null;

  return (
    <div className="pg-meus-ingressos">
      <SiteHeader user={user} variant="default" activePath="/meus-ingressos" />
      {!user.emailVerified && (
        <div className="wrap mi-verify" role="status">
          <span><b>Confirme seu e-mail.</b> Assim os ingressos, transferências e avisos do evento chegam certinho para você.</span>
          <Link href="/ativar-conta">Ativar conta</Link>
        </div>
      )}
      <MeusIngressos groups={groups} lists={lists} pending={pending} sent={sent} incoming={incoming} confirmedOrder={confirmedOrder} wallet={{ apple: appleWalletEnabled(), google: googleWalletEnabled() }} />
      <SiteFooter />
    </div>
  );
}
