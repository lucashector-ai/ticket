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

/**
 * Pedidos resumidos no banco (para o financeiro e o extrato do Banco, sem trazer pedido por pedido): uma linha
 * por evento, situação, dia (fuso de São Paulo), venda de teste e valor dos ingressos. Agrupar também pelo
 * valor mantém a taxa arredondada pedido a pedido (`platformFee`), igual a somar os pedidos um a um.
 * `trail`: o pedido tem reembolso registrado (order_refunds pendente/concluído, de verdade, com parte do produtor).
 */
export type OrderSum = { eventId: string; status: "paid" | "refunded"; day: string; at: Date; test: boolean; trail: boolean; revenue: number; n: number; qty: number };
export async function orderSums(eventIds: string[]): Promise<OrderSum[]> {
  if (!eventIds.length) return [];
  const ids = sql.join(eventIds.map((id) => sql`${id}`), sql`, `);
  const rows = await db.execute<{ event_id: string; status: "paid" | "refunded"; day: string; at: string; test: boolean; trail: boolean; revenue: number; n: string; qty: string }>(sql`
    with o as (
      select o.id, o.event_id, o.status, coalesce(o.paid_at, o.created_at) as at,
        (o.payment_method::text = 'test' or coalesce(o.payment_ref, '') like 'TEST-%') as test,
        o.subtotal_cents - o.meia_cents - o.discount_cents as revenue
      from ${orders} o
      where o.event_id in (${ids}) and o.status in ('paid', 'refunded') and o.resale_listing_id is null
    ), q as (
      select oi.order_id, sum(oi.quantity) as qty from ${orderItems} oi where oi.order_id in (select id from o) group by oi.order_id
    ), t as (
      select distinct r.order_id from ${schema.orderRefunds} r
      where r.event_id in (${ids}) and r.status in ('pending', 'succeeded') and r.test = false and r.producer_cents > 0
    )
    select o.event_id, o.status, to_char(o.at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, max(o.at) as at,
      o.test, (t.order_id is not null) as trail, o.revenue, count(*) as n, coalesce(sum(q.qty), 0) as qty
    from o left join q on q.order_id = o.id left join t on t.order_id = o.id
    group by 1, 2, 3, 5, 6, 7`);
  return rows.rows.map((r) => ({
    eventId: r.event_id, status: r.status, day: r.day, at: new Date(r.at), test: !!r.test, trail: !!r.trail,
    revenue: Number(r.revenue), n: Number(r.n), qty: Number(r.qty),
  }));
}

/** Soma de linhas de `orderSums` de um evento: vendido, líquido (taxa por pedido), ingressos e pedidos. */
export function totalsOf(rows: OrderSum[], absorb: boolean) {
  return rows.reduce((t, s) => ({
    gross: t.gross + s.revenue * s.n, net: t.net + (s.revenue - platformFee(s.revenue, absorb)) * s.n, qty: t.qty + s.qty, orders: t.orders + s.n,
  }), { gross: 0, net: 0, qty: 0, orders: 0 });
}
