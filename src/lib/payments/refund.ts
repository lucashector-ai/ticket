import "server-only";
import { after } from "next/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { mailOrderRefunded } from "@/lib/notify";
import { isTestPayment, stripe, stripeEnabled } from "@/lib/payments/stripe";

const { orders, tickets, ticketTypes, resaleListings } = schema;

export type RefundResult = { ok: true; refundedCents: number; full: boolean; stripeRefundId: string | null } | { ok: false; error: string };

/**
 * Reembolsa um pedido. Pago pela Stripe: cria o reembolso lá (parcial quando `amountCents` < total).
 * Reembolso total: o pedido vira "refunded", os ingressos válidos deixam de valer e o estoque volta.
 * Pedido de teste (TEST-…) ou grátis: só marca como reembolsado aqui.
 * Idempotente por pedido + valor (a mesma chamada repetida não estorna duas vezes).
 *
 * `email`: texto do e-mail para quem pagou (sem ele, não manda e-mail).
 */
export async function refundOrder(orderId: string, opts: { amountCents?: number; email?: string; reason?: "requested_by_customer" | "duplicate" | "fraudulent" } = {}): Promise<RefundResult> {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) return { ok: false, error: "Pedido não encontrado." };
  if (o.status === "refunded") return { ok: true, refundedCents: 0, full: true, stripeRefundId: null };
  const amount = Math.min(opts.amountCents ?? o.totalCents, o.totalCents);
  if (amount <= 0 && o.totalCents > 0) return { ok: false, error: "Valor de reembolso inválido." };
  const full = amount >= o.totalCents;
  let refundId: string | null = null;

  if (o.stripePaymentIntentId && !isTestPayment(o) && o.totalCents > 0) {
    if (!stripeEnabled()) return { ok: false, error: "A Stripe não está configurada: reembolse pelo painel da Stripe." };
    try {
      const r = await stripe().refunds.create(
        {
          payment_intent: o.stripePaymentIntentId,
          ...(full ? {} : { amount }),
          reason: opts.reason ?? "requested_by_customer",
          metadata: { orderId: o.id, orderNumber: String(o.number ?? "") },
        },
        { idempotencyKey: `refund-${o.id}-${full ? "full" : amount}` },
      );
      refundId = r.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // já estornado (pelo painel da Stripe ou por uma chamada anterior): segue para marcar aqui
      if (err.code !== "charge_already_refunded") {
        console.error("stripe refund", o.id, err.message);
        return { ok: false, error: "Não foi possível estornar na Stripe. Tente de novo ou estorne pelo painel da Stripe." };
      }
    }
  }
  if (full) await markOrderRefunded(o.id);
  if (opts.email) {
    const text = opts.email;
    after(() => mailOrderRefunded(o.id, text, amount));
  }
  return { ok: true, refundedCents: amount, full, stripeRefundId: refundId };
}

/**
 * Marca o pedido como reembolsado (idempotente). Ingressos válidos viram "refunded" (o QR deixa de
 * valer na portaria), anúncios de revenda deles são cancelados e os lugares voltam para a venda.
 */
export async function markOrderRefunded(orderId: string) {
  const [o] = await db.update(orders).set({ status: "refunded" })
    .where(and(eq(orders.id, orderId), ne(orders.status, "refunded")))
    .returning({ id: orders.id, resaleListingId: orders.resaleListingId });
  if (!o) return false;
  const gone = await db.update(tickets).set({ status: "refunded" })
    .where(and(eq(tickets.orderId, orderId), eq(tickets.status, "valid")))
    .returning({ id: tickets.id, ticketTypeId: tickets.ticketTypeId });
  if (gone.length) {
    await db.update(resaleListings).set({ status: "cancelled" })
      .where(and(inArray(resaleListings.ticketId, gone.map((t) => t.id)), inArray(resaleListings.status, ["active", "reserved"])));
    // ingresso comprado na revenda não volta para o estoque do produtor (ele já tinha sido vendido antes)
    if (!o.resaleListingId) {
      const byType = new Map<string, number>();
      for (const t of gone) byType.set(t.ticketTypeId, (byType.get(t.ticketTypeId) ?? 0) + 1);
      for (const [id, n] of byType) {
        await db.update(ticketTypes).set({ sold: sql`greatest(${ticketTypes.sold} - ${n}, 0)` }).where(eq(ticketTypes.id, id));
      }
    }
  }
  return true;
}
