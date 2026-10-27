import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { SERVICE_FEE_RATE } from "@/lib/pricing";

const { organizers, events, orders, orderItems, ticketTypes, tickets, coupons } = schema;

/* Dinheiro do produtor: o que entrou pelos ingressos (sem a taxa do comprador). Se ele
   absorve a taxa, a plataforma desconta 10% disso; senão o comprador já pagou a taxa à parte. */
export const ticketRevenue = (o: { subtotalCents: number; meiaCents: number; discountCents: number }) => o.subtotalCents - o.meiaCents - o.discountCents;
export const platformFee = (revenue: number, absorb: boolean) => (absorb ? Math.round(revenue * SERVICE_FEE_RATE) : 0);

export type PaidOrder = {
  id: string; number: number | null; eventId: string; at: Date; qty: number; revenue: number; net: number; buyerFee: number;
  buyer: string; method: string | null; status: string; couponId: string | null; discount: number;
};

/** Produtor do usuário e os eventos dele (os do produtor e os que ele mesmo criou). */
export async function getPainelScope(userId: string) {
  const org = await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, userId) });
  const evs = await db.query.events.findMany({
    where: org ? or(eq(events.organizerId, org.id), eq(events.createdByUserId, userId)) : eq(events.createdByUserId, userId),
    with: { venue: { with: { city: true } }, ticketTypes: true },
    orderBy: [desc(events.startAt)],
  });
  return { org: org ?? null, events: evs };
}
export type PainelEvent = Awaited<ReturnType<typeof getPainelScope>>["events"][number];

/** Pedidos pagos (e reembolsados, para o financeiro) dos eventos, com quantidade e valores. */
export async function listOrders(eventIds: string[], absorbById: Map<string, boolean>): Promise<PaidOrder[]> {
  if (!eventIds.length) return [];
  const rows = await db.query.orders.findMany({
    where: and(inArray(orders.eventId, eventIds), inArray(orders.status, ["paid", "refunded"])),
    columns: { id: true, number: true, eventId: true, status: true, subtotalCents: true, meiaCents: true, discountCents: true, feeCents: true, paidAt: true, createdAt: true, buyerName: true, paymentMethod: true, couponId: true },
    with: { items: { columns: { quantity: true } } },
    orderBy: [desc(orders.createdAt)],
  });
  return rows.map((o) => {
    const revenue = ticketRevenue(o);
    return {
      id: o.id, number: o.number, eventId: o.eventId, at: o.paidAt ?? o.createdAt, qty: o.items.reduce((s, i) => s + i.quantity, 0),
      revenue, net: revenue - platformFee(revenue, absorbById.get(o.eventId) ?? false), buyerFee: o.feeCents,
      buyer: o.buyerName ?? "Comprador", method: o.paymentMethod, status: o.status, couponId: o.couponId, discount: o.discountCents,
    };
  });
}

/** Participantes (ingressos emitidos) de um evento. */
export async function listParticipants(eventId: string) {
  return db
    .select({
      id: tickets.id, code: tickets.code, holder: tickets.holderName, half: tickets.halfPrice, status: tickets.status, checkedInAt: tickets.checkedInAt,
      type: ticketTypes.name, sector: ticketTypes.sector, color: ticketTypes.sectorColor,
      orderNumber: orders.number, buyer: orders.buyerName, email: orders.buyerEmail, at: orders.createdAt,
    })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.eventId, eventId))
    .orderBy(desc(orders.createdAt))
    .limit(5000);
}

/** Receita e quantidade por tipo de ingresso (pedidos pagos). */
export async function revenueByType(eventId: string) {
  const rows = await db
    .select({ typeId: orderItems.ticketTypeId, qty: orderItems.quantity, price: orderItems.unitPriceCents })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")));
  const m = new Map<string, { qty: number; cents: number }>();
  for (const r of rows) {
    const x = m.get(r.typeId) ?? { qty: 0, cents: 0 };
    x.qty += r.qty; x.cents += r.qty * r.price; m.set(r.typeId, x);
  }
  return m;
}

export async function listEventCoupons(eventId: string) {
  return db.query.coupons.findMany({ where: eq(coupons.eventId, eventId) });
}
