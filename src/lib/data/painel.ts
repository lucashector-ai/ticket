import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { chosenOrgId, orgAccessList, pickActive, type PainelRole } from "@/lib/data/org-access";

const { organizerMembers, events, orders, orderItems, ticketTypes, tickets, coupons } = schema;

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

export type { PainelRole };

/**
 * Produtora ativa do usuário (dona ou da equipe, ver org-access.ts), o papel dele nela e os eventos dela. Aceita
 * convites pendentes do e-mail da conta, só com o e-mail confirmado: a conta com senha funciona antes da confirmação,
 * e qualquer um poderia criar uma conta com o e-mail de um convite ainda não aceito e entrar na equipe.
 * Os eventos são os da produtora ativa (de quem quer que tenha criado: dono ou admin); conta sem produtora vê os
 * eventos que criou. Uma produtora nunca vê os eventos de outra, mesmo do mesmo dono.
 */
export const getPainelScope = cache(async (user: { id: string; email?: string | null; emailVerified?: boolean | null }) => {
  if (user.email && user.emailVerified) {
    await db.update(organizerMembers).set({ userId: user.id, acceptedAt: new Date() })
      .where(and(sql`lower(${organizerMembers.email}) = lower(${user.email})`, isNull(organizerMembers.userId)));
  }
  const [list, chosen] = await Promise.all([orgAccessList(user.id), chosenOrgId()]);
  const active = pickActive(list, chosen);
  const org = active?.org ?? null;
  const role: PainelRole = active?.role ?? "owner";
  const evs = await db.query.events.findMany({
    // evento antigo sem produtora: aparece para quem criou, na produtora dele
    where: !org ? eq(events.createdByUserId, user.id) : role === "owner" ? or(eq(events.organizerId, org.id), and(isNull(events.organizerId), eq(events.createdByUserId, user.id))) : eq(events.organizerId, org.id),
    with: { venue: { with: { city: true } }, ticketTypes: true },
    orderBy: [desc(events.startAt)],
  });
  return { org, role, events: evs, orgs: list };
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
  return rows.map((o) => toPaidOrder(o, absorbById));
}

type OrderRow = {
  id: string; number: number | null; eventId: string; userId: string; buyerEmail: string | null; status: string; subtotalCents: number; meiaCents: number;
  discountCents: number; feeCents: number; paidAt: Date | null; createdAt: Date; buyerName: string | null; paymentMethod: string | null; paymentRef: string | null;
  couponId: string | null; items: { quantity: number }[];
};
function toPaidOrder(o: OrderRow, absorbById: Map<string, boolean>): PaidOrder {
  const revenue = ticketRevenue(o);
  return {
    id: o.id, number: o.number, eventId: o.eventId, at: o.paidAt ?? o.createdAt, qty: o.items.reduce((s, i) => s + i.quantity, 0),
    revenue, net: revenue - platformFee(revenue, absorbById.get(o.eventId) ?? false), buyerFee: o.feeCents,
    buyer: o.buyerName ?? "Comprador", method: o.paymentMethod, status: o.status, couponId: o.couponId, discount: o.discountCents,
    userId: o.userId, email: o.buyerEmail, meia: o.meiaCents > 0,
    test: o.paymentMethod === "test" || !!o.paymentRef?.startsWith("TEST-"),
  };
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

const idList = (eventIds: string[]) => sql.join(eventIds.map((id) => sql`${id}`), sql`, `);
/** Pedidos pagos que entram nos números do produtor (sem a revenda, que é dinheiro do fã), com a quantidade. */
const paidOrdersCte = (eventIds: string[]) => sql`
  select o.id, o.event_id, o.user_id, o.buyer_name, o.buyer_email, o.coupon_id, o.discount_cents, o.meia_cents, o.created_at,
    coalesce(o.paid_at, o.created_at) as at, o.subtotal_cents - o.meia_cents - o.discount_cents as revenue,
    (select coalesce(sum(oi.quantity), 0) from ${orderItems} oi where oi.order_id = o.id)::int as qty
  from ${orders} o
  where o.event_id in (${idList(eventIds)}) and o.status = 'paid' and o.resale_listing_id is null`;

/**
 * Início do painel, somado no banco: uma linha por evento, valor dos ingressos, quantidade do pedido, dia (contado a
 * partir de `start7`, a meia-noite do começo da minilinha de 7 dias) e janela (7/30 dias e as anteriores, a partir de
 * `now`). Agrupar pelo valor e pela quantidade mantém a taxa arredondada pedido a pedido e o ticket médio da
 * minilinha iguais aos de somar os pedidos um a um (paridade em tests/db/painel-sums.test.ts).
 */
export type PaidBucket = { eventId: string; revenue: number; qty: number; day: number; w7: boolean; p7: boolean; w30: boolean; p30: boolean; n: number; first: number };
export async function paidBuckets(eventIds: string[], now: number, start7: number): Promise<PaidBucket[]> {
  if (!eventIds.length) return [];
  const D = 86_400_000;
  const r = await db.execute<{ event_id: string; revenue: number; qty: number; day: number; w7: boolean; p7: boolean; w30: boolean; p30: boolean; n: string; first: string }>(sql`
    with o as (${paidOrdersCte(eventIds)}), m as (select o.*, floor(extract(epoch from o.at) * 1000)::bigint as ms from o)
    select event_id, revenue, qty, floor((ms - ${start7}::bigint)::numeric / ${D})::int as day,
      ms >= ${now - 7 * D}::bigint as w7, (ms < ${now - 7 * D}::bigint and ms >= ${now - 14 * D}::bigint) as p7,
      ms >= ${now - 30 * D}::bigint as w30, (ms < ${now - 30 * D}::bigint and ms >= ${now - 60 * D}::bigint) as p30,
      count(*) as n, min(ms) as first
    from m group by 1, 2, 3, 4, 5, 6, 7, 8`);
  return r.rows.map((x) => ({
    eventId: x.event_id, revenue: Number(x.revenue), qty: Number(x.qty), day: Number(x.day),
    w7: !!x.w7, p7: !!x.p7, w30: !!x.w30, p30: !!x.p30, n: Number(x.n), first: Number(x.first),
  }));
}

/** Os últimos pedidos pagos (feed do início do painel), já com a quantidade e o líquido. */
export async function latestPaid(eventIds: string[], absorbById: Map<string, boolean>, limit = 6): Promise<PaidOrder[]> {
  if (!eventIds.length) return [];
  const rows = await db.query.orders.findMany({
    where: and(inArray(orders.eventId, eventIds), eq(orders.status, "paid"), isNull(orders.resaleListingId)),
    columns: { id: true, number: true, eventId: true, userId: true, buyerEmail: true, status: true, subtotalCents: true, meiaCents: true, discountCents: true, feeCents: true, paidAt: true, createdAt: true, buyerName: true, paymentMethod: true, paymentRef: true, couponId: true },
    with: { items: { columns: { quantity: true } } },
    orderBy: [desc(orders.createdAt)],
    limit,
  });
  return rows.map((o) => toPaidOrder(o, absorbById));
}

/**
 * Público, somado no banco: uma linha por comprador e evento (pedidos, ingressos, gasto sem a taxa, última compra,
 * meia) com o nome e o e-mail do pedido mais recente. O número de linhas cresce com compradores, não com pedidos.
 */
export type BuyerSum = { userId: string; eventId: string; n: number; qty: number; spent: number; last: Date; meia: number; name: string | null; email: string | null; newest: Date };
export async function buyerSums(eventIds: string[]): Promise<BuyerSum[]> {
  if (!eventIds.length) return [];
  const r = await db.execute<{ user_id: string; event_id: string; n: string; qty: string; spent: string; last: string; meia: string; name: string | null; email: string | null; newest: string }>(sql`
    with o as (${paidOrdersCte(eventIds)})
    select user_id, event_id, count(*) as n, sum(qty) as qty, sum(revenue) as spent, max(at) as last,
      count(*) filter (where meia_cents > 0) as meia,
      (array_agg(buyer_name order by created_at desc))[1] as name, (array_agg(buyer_email order by created_at desc))[1] as email,
      max(created_at) as newest
    from o group by 1, 2`);
  return r.rows.map((x) => ({
    userId: x.user_id, eventId: x.event_id, n: Number(x.n), qty: Number(x.qty), spent: Number(x.spent), last: new Date(x.last),
    meia: Number(x.meia), name: x.name, email: x.email, newest: new Date(x.newest),
  }));
}

/** Uso de cada cupom nos pedidos pagos: vezes, desconto dado e valor dos ingressos (sem a taxa). */
export async function couponSums(eventIds: string[]): Promise<Map<string, { n: number; off: number; rev: number }>> {
  if (!eventIds.length) return new Map();
  const r = await db.execute<{ coupon_id: string; n: string; off: string; rev: string }>(sql`
    with o as (${paidOrdersCte(eventIds)})
    select coupon_id, count(*) as n, sum(discount_cents) as off, sum(revenue) as rev from o where coupon_id is not null group by 1`);
  return new Map(r.rows.map((x) => [x.coupon_id, { n: Number(x.n), off: Number(x.off), rev: Number(x.rev) }]));
}

/** Soma de linhas de `orderSums` de um evento: vendido, líquido (taxa por pedido), ingressos e pedidos. */
export function totalsOf(rows: OrderSum[], absorb: boolean) {
  return rows.reduce((t, s) => ({
    gross: t.gross + s.revenue * s.n, net: t.net + (s.revenue - platformFee(s.revenue, absorb)) * s.n, qty: t.qty + s.qty, orders: t.orders + s.n,
  }), { gross: 0, net: 0, qty: 0, orders: 0 });
}
