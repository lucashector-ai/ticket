import { getCloudflareContext } from "@opennextjs/cloudflare";
import type Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fulfillOrder } from "@/lib/payments/fulfill";
import { syncStripeRefund } from "@/lib/payments/refund";
import { stripeEnabled, stripeRef, verifyStripeEvent } from "@/lib/payments/stripe";

/*
 * Webhook da Stripe (Dashboard → Developers → Webhooks → Add endpoint):
 *   URL: https://ticketswin.com.br/api/webhooks/stripe
 *   Eventos: payment_intent.succeeded, payment_intent.payment_failed, payment_intent.canceled, charge.refunded
 *   O "Signing secret" (whsec_...) vai em STRIPE_WEBHOOK_SECRET.
 *
 * payment_intent.succeeded é o que confirma o pedido e emite os ingressos (mesma rotina idempotente do
 * checkout). Resposta 5xx faz a Stripe tentar de novo; eventos já processados ficam marcados no KV.
 */

const { orders } = schema;
const SEEN_TTL = 60 * 60 * 24 * 7;

async function kv() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.KV ?? null;
  } catch {
    return null;
  }
}

async function orderFor(pi: { id: string; metadata?: Stripe.Metadata | null }) {
  const byPi = await db.query.orders.findFirst({ where: eq(orders.stripePaymentIntentId, pi.id), columns: { id: true, stripePaymentIntentId: true } });
  if (byPi) return byPi;
  // PaymentIntent criado mas o id não chegou a ser gravado no pedido: acha pelo metadata e grava
  const orderId = pi.metadata?.orderId;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), columns: { id: true, stripePaymentIntentId: true } });
  if (o && !o.stripePaymentIntentId) await db.update(orders).set({ stripePaymentIntentId: pi.id }).where(eq(orders.id, o.id));
  return o && (!o.stripePaymentIntentId || o.stripePaymentIntentId === pi.id) ? o : null;
}

export async function POST(req: Request) {
  if (!stripeEnabled()) return Response.json({ error: "stripe não configurada" }, { status: 503 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeEvent(raw, req.headers.get("stripe-signature"));
  } catch (e) {
    console.error("stripe webhook: assinatura", (e as Error).message);
    return Response.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const store = await kv();
  const seenKey = `stw:${event.id}`;
  if (store && (await store.get(seenKey))) return Response.json({ ok: true, duplicate: true });

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const o = await orderFor(pi);
        if (!o) {
          console.error("stripe webhook: pedido não encontrado", pi.id);
          break;
        }
        const r = await fulfillOrder(o.id, { ref: stripeRef(pi.id), charged: true });
        // outra chamada emitindo agora, ou o estorno automático falhou: 500 faz a Stripe repetir mais tarde
        if (!r.ok && (r.busy || r.retry)) return Response.json({ error: r.error }, { status: 500 });
        if (!r.ok) console.warn("stripe webhook: pedido não emitido", o.id, r.error);
        break;
      }
      case "payment_intent.payment_failed": {
        // cartão recusado / Pix falhou: o pedido continua pendente (dá para tentar de novo até a reserva vencer)
        const pi = event.data.object;
        console.warn("stripe webhook: pagamento falhou", pi.id, pi.last_payment_error?.code ?? "");
        break;
      }
      case "payment_intent.canceled": {
        const pi = event.data.object;
        const o = await orderFor(pi);
        if (o) await db.update(orders).set({ status: "expired" }).where(and(eq(orders.id, o.id), inArray(orders.status, ["pending"])));
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object;
        const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
        if (!piId) break;
        const o = await orderFor({ id: piId, metadata: ch.metadata });
        // Estornos feitos pela Tickets Win já estão na trilha (order_refunds, criada antes da chamada) e não são
        // processados de novo; o que foi estornado direto no painel da Stripe entra como linha "stripe".
        // Parcial: o pedido segue pago com refunded_cents; total: os ingressos deixam de valer.
        if (o) await syncStripeRefund(o.id, { id: ch.id, amountRefunded: ch.amount_refunded, fully: ch.refunded });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("stripe webhook", event.type, event.id, e);
    return Response.json({ error: "falha ao processar" }, { status: 500 });
  }

  if (store) await store.put(seenKey, "1", { expirationTtl: SEEN_TTL });
  return Response.json({ ok: true });
}
