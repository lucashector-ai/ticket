import "server-only";
import { after } from "next/server";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cancelIntent } from "@/lib/payments/intents";
import { refundTickets, type Actor } from "@/lib/payments/refund";
import { stripeEnabled } from "@/lib/payments/stripe";
import { mailGuestsEventCancelled } from "@/lib/refund-mail";

/*
 * Cancelamento do evento inteiro.
 *
 * 1. startCancellation (na hora, no clique do produtor): evento vira "cancelled" (a compra, o checkout, o
 *    grupo e a revenda só aceitam evento publicado), anúncios da revenda e grupos abertos são cancelados,
 *    pedidos pendentes são cancelados (com a cobrança pendente na Stripe), e a lista free é avisada.
 * 2. processCancellation (em lotes): reembolsa cada pedido pago, integral e com a taxa. A fila é a própria
 *    tabela de pedidos (pago + com ingresso a reembolsar), então é idempotente e retomável: roda pelo painel
 *    enquanto o produtor acompanha e pelo cron a cada minuto, em lotes curtos (limite de tempo do Worker).
 *    Pedido que falha 3 vezes (ou falhou há menos de 10 min) fica de fora até alguém tocar em "Tentar de novo".
 */

const { events, orders, tickets, orderRefunds, resaleListings, groupOrders } = schema;
const RETRY_AFTER_MIN = 10;
const MAX_AUTO_ATTEMPTS = 3;

/** Pedidos do evento que ainda têm algo a reembolsar. `includeFailed`: inclui os que falharam (tentar de novo). */
async function todo(eventId: string, limit: number, includeFailed: boolean) {
  const r = await db.execute<{ id: string }>(sql`
    select o.id from ${orders} o
    where o.event_id = ${eventId} and o.status = 'paid'
      and exists (select 1 from ${tickets} t where t.order_id = o.id and t.status in ('valid', 'used', 'transferred'))
      ${includeFailed ? sql`` : sql`and not exists (
        select 1 from ${orderRefunds} r where r.order_id = o.id and r.kind = 'event' and r.status = 'failed'
          and (r.attempts >= ${MAX_AUTO_ATTEMPTS} or r.updated_at > now() - make_interval(mins => ${RETRY_AFTER_MIN}))
      )`}
    order by o.created_at
    limit ${limit}`);
  return r.rows.map((x) => x.id);
}

export async function startCancellation(eventId: string, actor: Actor, reason: string | null) {
  const [ev] = await db.update(events).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, cancelledByUserId: actor.userId })
    .where(and(eq(events.id, eventId), inArray(events.status, ["published", "draft", "finished"])))
    .returning({ id: events.id });
  if (!ev) return false;
  await db.update(resaleListings).set({ status: "cancelled" }).where(and(eq(resaleListings.eventId, eventId), inArray(resaleListings.status, ["active", "reserved"])));
  await db.update(groupOrders).set({ status: "cancelled" }).where(and(eq(groupOrders.eventId, eventId), eq(groupOrders.status, "open")));
  // pedidos esperando pagamento: cancelados aqui; um Pix pago depois disso é estornado na emissão (evento cancelado)
  const pend = await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.eventId, eventId), eq(orders.status, "pending")))
    .returning({ pi: orders.stripePaymentIntentId });
  const pis = pend.map((p) => p.pi).filter((x): x is string => !!x);
  after(async () => {
    if (stripeEnabled()) for (const pi of pis.slice(0, 200)) await cancelIntent(pi);
    await mailGuestsEventCancelled(eventId, reason);
  });
  return true;
}

/** Um lote do reembolso do evento cancelado. Devolve quantos foram reembolsados, falharam e se ainda há fila. */
export async function processCancellation(eventId: string, opts: { limit?: number; budgetMs?: number; retryFailed?: boolean } = {}) {
  const ev = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { status: true, cancelReason: true, cancelledByUserId: true } });
  if (!ev || ev.status !== "cancelled") return { done: 0, failed: 0, more: false };
  const ids = await todo(eventId, opts.limit ?? 8, !!opts.retryFailed);
  const t0 = Date.now();
  let done = 0, failed = 0;
  for (const id of ids) {
    if (Date.now() - t0 > (opts.budgetMs ?? 15_000)) break;
    const r = await refundTickets({
      orderId: id, ticketIds: "all", kind: "event", actor: { userId: ev.cancelledByUserId, name: "Cancelamento do evento" },
      note: ev.cancelReason, allowCheckedIn: true, eventId,
    });
    if (r.ok) done++;
    else if (r.code !== "busy") failed++;
  }
  const more = (await todo(eventId, 1, false)).length > 0;
  return { done, failed, more };
}

export type CancelProgress = { total: number; refunded: number; left: number; failed: { orderId: string; number: number | null; buyer: string; error: string; attempts: number }[]; refundedCents: number };

/** "X de Y reembolsados", falhas e quanto já voltou. */
export async function cancelProgress(eventId: string): Promise<CancelProgress> {
  const [left] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from ${orders} o where o.event_id = ${eventId} and o.status = 'paid'
      and exists (select 1 from ${tickets} t where t.order_id = o.id and t.status in ('valid', 'used', 'transferred'))`).then((r) => r.rows);
  const [done] = await db.select({ n: sql<number>`count(distinct ${orderRefunds.orderId})::int`, cents: sql<number>`coalesce(sum(${orderRefunds.amountCents}), 0)::int` })
    .from(orderRefunds).where(and(eq(orderRefunds.eventId, eventId), eq(orderRefunds.kind, "event"), eq(orderRefunds.status, "succeeded")));
  const fails = await db.select({ orderId: orderRefunds.orderId, error: orderRefunds.error, attempts: orderRefunds.attempts, number: orders.number, buyer: orders.buyerName })
    .from(orderRefunds).innerJoin(orders, eq(orders.id, orderRefunds.orderId))
    .where(and(eq(orderRefunds.eventId, eventId), eq(orderRefunds.kind, "event"), eq(orderRefunds.status, "failed"), eq(orders.status, "paid"), isNotNull(orderRefunds.error)))
    .limit(50);
  const l = left?.n ?? 0, d = done?.n ?? 0;
  return {
    total: l + d, refunded: d, left: l, refundedCents: done?.cents ?? 0,
    failed: fails.map((f) => ({ orderId: f.orderId, number: f.number, buyer: f.buyer ?? "Comprador", error: f.error ?? "", attempts: f.attempts })),
  };
}

/** Cron: continua os cancelamentos em andamento (lotes curtos, no máximo ~20 s por minuto). */
export async function runCancellations() {
  const rows = await db.execute<{ id: string }>(sql`
    select e.id from ${events} e where e.status = 'cancelled' and e.cancelled_at is not null
      and exists (select 1 from ${orders} o where o.event_id = e.id and o.status = 'paid')
    order by e.cancelled_at limit 5`);
  const t0 = Date.now();
  let done = 0, failed = 0;
  for (const { id } of rows.rows) {
    const left = 20_000 - (Date.now() - t0);
    if (left < 2_000) break;
    const r = await processCancellation(id, { limit: 20, budgetMs: left });
    done += r.done; failed += r.failed;
  }
  return { events: rows.rows.length, done, failed };
}
