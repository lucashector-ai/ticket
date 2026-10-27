import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";

/** Cookie com o código do último link de divulgação clicado (vale 30 dias, o último clique ganha). */
export const REF_COOKIE = "tw_ref";

/** Parceiro que trouxe a compra deste evento, se o link dele ainda vale para o evento. */
export async function promoterForOrder(ev: { id: string; organizerId: string | null }) {
  const code = (await cookies()).get(REF_COOKIE)?.value;
  if (!code || !ev.organizerId) return null;
  const p = await db.query.promoters.findFirst({ where: and(eq(schema.promoters.code, code), eq(schema.promoters.active, true)) });
  if (!p || p.organizerId !== ev.organizerId || (p.eventId && p.eventId !== ev.id)) return null;
  return p;
}

export type PromoterStats = { orders: number; tickets: number; revenueCents: number; commissionCents: number };

/** Vendas pagas de cada parceiro: pedidos, ingressos, valor dos ingressos e comissão. */
export async function promoterStats(ids: string[]): Promise<Map<string, PromoterStats>> {
  const out = new Map<string, PromoterStats>();
  if (!ids.length) return out;
  const { orders, orderItems } = schema;
  const rows = await db
    .select({
      id: orders.promoterId,
      orders: sql<number>`count(distinct ${orders.id})::int`,
      tickets: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(inArray(orders.promoterId, ids), eq(orders.status, "paid")))
    .groupBy(orders.promoterId);
  const money = await db
    .select({
      id: orders.promoterId,
      revenue: sql<number>`coalesce(sum(${orders.totalCents} - ${orders.feeCents} - ${orders.interestCents}), 0)::int`,
      commission: sql<number>`coalesce(sum(${orders.commissionCents}), 0)::int`,
    })
    .from(orders)
    .where(and(inArray(orders.promoterId, ids), eq(orders.status, "paid")))
    .groupBy(orders.promoterId);
  for (const r of rows) if (r.id) out.set(r.id, { orders: r.orders, tickets: r.tickets, revenueCents: 0, commissionCents: 0 });
  for (const m of money) if (m.id) { const x = out.get(m.id); if (x) { x.revenueCents = m.revenue; x.commissionCents = m.commission; } }
  return out;
}
