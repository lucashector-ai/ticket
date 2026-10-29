import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SERVICE_FEE_RATE } from "@/lib/pricing";

const { organizers, organizerMembers, events, orders, orderItems, ticketTypes, tickets, coupons } = schema;

/* Dinheiro do produtor: o que entrou pelos ingressos (sem a taxa do comprador). Se ele
   absorve a taxa, a plataforma desconta 7,99% disso; senão o comprador já pagou a taxa à parte. */
export const ticketRevenue = (o: { subtotalCents: number; meiaCents: number; discountCents: number }) => o.subtotalCents - o.meiaCents - o.discountCents;
export const platformFee = (revenue: number, absorb: boolean) => (absorb ? Math.round(revenue * SERVICE_FEE_RATE) : 0);

export type PaidOrder = {
  id: string; number: number | null; eventId: string; at: Date; qty: number; revenue: number; net: number; buyerFee: number;
  buyer: string; method: string | null; status: string; couponId: string | null; discount: number;
  userId: string; email: string | null; meia: boolean;
  /** paga no modo de teste (sem gateway, payment_ref TEST-…): não é dinheiro de verdade */
  test: boolean;
};

export type PainelRole = "owner" | "admin" | "portaria";

/**
 * Produtor do usuário (dono ou membro da equipe), o papel dele e os eventos. Aceita convites pendentes do e-mail da conta,
 * só com o e-mail confirmado: a conta com senha funciona antes da confirmação, e qualquer um poderia criar uma conta com o
 * e-mail de um convite ainda não aceito e entrar na equipe.
 */
export const getPainelScope = cache(async (user: { id: string; email?: string | null; emailVerified?: boolean | null }) => {
  if (user.email && user.emailVerified) {
    await db.update(organizerMembers).set({ userId: user.id, acceptedAt: new Date() })
      .where(and(sql`lower(${organizerMembers.email}) = lower(${user.email})`, isNull(organizerMembers.userId)));
  }
  let role: PainelRole = "owner";
  let org = (await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, user.id) })) ?? null;
  if (!org) {
    const m = await db.query.organizerMembers.findFirst({ where: eq(organizerMembers.userId, user.id), with: { organizer: true } });
    if (m) { org = m.organizer; role = m.role === "admin" ? "admin" : "portaria"; }
  }
  const evs = await db.query.events.findMany({
    where: !org ? eq(events.createdByUserId, user.id) : role === "owner" ? or(eq(events.organizerId, org.id), eq(events.createdByUserId, user.id)) : eq(events.organizerId, org.id),
    with: { venue: { with: { city: true } }, ticketTypes: true },
    orderBy: [desc(events.startAt)],
  });
  return { org, role, events: evs };
});
export type PainelEvent = Awaited<ReturnType<typeof getPainelScope>>["events"][number];

/** Pedidos pagos (e reembolsados, para o financeiro) dos eventos, com quantidade e valores. */
export async function listOrders(eventIds: string[], absorbById: Map<string, boolean>): Promise<PaidOrder[]> {
  if (!eventIds.length) return [];
  const rows = await db.query.orders.findMany({
    // compras na revenda não entram: o dinheiro é do fã que revendeu, não do produtor
    where: and(inArray(orders.eventId, eventIds), inArray(orders.status, ["paid", "refunded"]), isNull(orders.resaleListingId)),
    columns: { id: true, number: true, eventId: true, userId: true, buyerEmail: true, status: true, subtotalCents: true, meiaCents: true, discountCents: true, feeCents: true, paidAt: true, createdAt: true, buyerName: true, paymentMethod: true, paymentRef: true, couponId: true },
    with: { items: { columns: { quantity: true } } },
    orderBy: [desc(orders.createdAt)],
  });
  return rows.map((o) => {
    const revenue = ticketRevenue(o);
    return {
      id: o.id, number: o.number, eventId: o.eventId, at: o.paidAt ?? o.createdAt, qty: o.items.reduce((s, i) => s + i.quantity, 0),
      revenue, net: revenue - platformFee(revenue, absorbById.get(o.eventId) ?? false), buyerFee: o.feeCents,
      buyer: o.buyerName ?? "Comprador", method: o.paymentMethod, status: o.status, couponId: o.couponId, discount: o.discountCents,
      userId: o.userId, email: o.buyerEmail, meia: o.meiaCents > 0,
      test: o.paymentMethod === "test" || !!o.paymentRef?.startsWith("TEST-"),
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
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid"), isNull(orders.resaleListingId)));
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
