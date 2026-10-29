import "server-only";
import type Stripe from "stripe";
import QRCode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { stripe, stripeErrorMessage } from "@/lib/payments/stripe";

const { orders, events } = schema;
type OrderRow = typeof orders.$inferSelect;

/** Menor cobrança que a Stripe aceita em reais. */
export const STRIPE_MIN_BRL_CENTS = 50;

/**
 * PaymentIntent do pedido: cria uma vez (chave de idempotência por pedido) e reaproveita nas novas
 * tentativas. Valor = orders.total_cents em BRL; o método (cartão ou Pix) é o escolhido no pedido.
 */
export async function ensureIntent(order: OrderRow): Promise<Stripe.PaymentIntent> {
  const s = stripe();
  if (order.stripePaymentIntentId) {
    const pi = await s.paymentIntents.retrieve(order.stripePaymentIntentId);
    // o valor do pedido não muda depois de criado; se mudou por algum motivo, acerta enquanto ainda dá
    if (pi.amount !== order.totalCents && (pi.status === "requires_payment_method" || pi.status === "requires_confirmation")) {
      return s.paymentIntents.update(pi.id, { amount: order.totalCents });
    }
    return pi;
  }
  const kind = order.paymentMethod === "card" ? "card" : "pix";
  const ev = await db.query.events.findFirst({ where: eq(events.id, order.eventId), columns: { title: true } });
  const number = order.number ?? 0;
  const pi = await s.paymentIntents.create(
    {
      amount: order.totalCents,
      currency: "brl",
      // (stripe@23 / API 2026-09-30: payment_method_types virou allowed_payment_method_types)
      allowed_payment_method_types: [kind],
      description: `Tickets Win · Pedido nº ${number}${ev ? ` · ${ev.title}`.slice(0, 200) : ""}`,
      metadata: { orderId: order.id, orderNumber: String(number), eventId: order.eventId, userId: order.userId },
      ...(order.buyerEmail ? { receipt_email: order.buyerEmail } : {}),
      ...(kind === "card"
        ? {
          // parcelamento: a Stripe devolve os planos que o cartão aceita depois que ele é informado
          payment_method_options: { card: { installments: { enabled: order.installments > 1 } } },
          // aparece na fatura depois do nome da conta (ex.: "TICKETSWIN* PED48213")
          statement_descriptor_suffix: `PED${number}`.slice(0, 22),
        }
        : {}),
    },
    { idempotencyKey: `order-${order.id}-pi` },
  );
  await db.update(orders).set({ stripePaymentIntentId: pi.id }).where(and(eq(orders.id, order.id), isNull(orders.stripePaymentIntentId)));
  return pi;
}

export type PixData = { pixCode: string; pixQrSvg: string; expiresAt: string; hostedUrl: string | null };

async function pixFrom(pi: Stripe.PaymentIntent): Promise<PixData | null> {
  const q = pi.next_action?.pix_display_qr_code;
  if (!q?.data) return null;
  return {
    pixCode: q.data,
    // desenhamos o QR aqui (mesmo visual do checkout) a partir do copia e cola da Stripe
    pixQrSvg: await QRCode.toString(q.data, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
    expiresAt: new Date((q.expires_at ?? Math.floor(Date.now() / 1000) + 900) * 1000).toISOString(),
    // só no modo de teste: a página da Stripe com o botão de simular o pagamento do Pix
    hostedUrl: pi.livemode ? null : q.hosted_instructions_url ?? null,
  };
}

/** Gera (ou devolve o já gerado) QR code Pix do pedido. Vale até o fim da reserva do pedido. */
export async function startPix(order: OrderRow): Promise<{ ok: true; pix: PixData } | { ok: false; error: string }> {
  if (order.totalCents < STRIPE_MIN_BRL_CENTS) return { ok: false, error: "O valor mínimo para pagar com Pix é R$ 0,50." };
  try {
    let pi = await ensureIntent(order);
    if (pi.status === "requires_action") {
      const px = await pixFrom(pi);
      if (px && new Date(px.expiresAt).getTime() > Date.now() + 30_000) return { ok: true, pix: px };
    }
    if (pi.status === "succeeded" || pi.status === "processing") return { ok: false, error: "Este pedido já foi pago." };
    if (pi.status === "canceled") return { ok: false, error: "Este código Pix expirou. Escolha os ingressos de novo." };
    const until = Math.floor((order.expiresAt ?? new Date(Date.now() + 15 * 60_000)).getTime() / 1000);
    const left = until - Math.floor(Date.now() / 1000);
    if (left < 60) return { ok: false, error: "O tempo da reserva acabou. Escolha os ingressos de novo." };
    pi = await stripe().paymentIntents.confirm(pi.id, {
      payment_method_data: {
        type: "pix",
        billing_details: { name: order.buyerName ?? undefined, email: order.buyerEmail ?? undefined },
      },
      payment_method_options: { pix: { expires_at: until } },
    });
    const px = await pixFrom(pi);
    if (!px) return { ok: false, error: "Não conseguimos gerar o código Pix. Tente de novo." };
    return { ok: true, pix: px };
  } catch (e) {
    console.error("stripe pix", order.id, (e as Error).message);
    return { ok: false, error: stripeErrorMessage(e) };
  }
}

export type CardStep =
  | { ok: true; status: "succeeded" | "processing" }
  | { ok: true; status: "requires_action"; clientSecret: string }
  | { ok: false; error: string; installments?: number[] };

/**
 * Cobra o cartão informado no Payment Element (PaymentMethod criado no navegador).
 * Parcelado: confere se o cartão aceita a quantidade de parcelas escolhida antes de confirmar.
 */
export async function chargeCard(order: OrderRow, paymentMethodId: string): Promise<CardStep> {
  if (order.totalCents < STRIPE_MIN_BRL_CENTS) return { ok: false, error: "O valor mínimo para pagar com cartão é R$ 0,50." };
  const s = stripe();
  try {
    let pi = await ensureIntent(order);
    if (pi.status === "succeeded" || pi.status === "processing") return { ok: true, status: pi.status === "succeeded" ? "succeeded" : "processing" };
    if (pi.status === "canceled") return { ok: false, error: "Este pedido expirou. Escolha os ingressos de novo." };
    if (pi.status === "requires_action" && pi.client_secret && pi.payment_method === paymentMethodId) return { ok: true, status: "requires_action", clientSecret: pi.client_secret };
    const n = order.installments;
    pi = await s.paymentIntents.update(pi.id, { payment_method: paymentMethodId });
    if (n > 1) {
      const plans = pi.payment_method_options?.card?.installments?.available_plans ?? [];
      const counts = plans.filter((p) => p.type === "fixed_count" && p.count).map((p) => p.count as number);
      if (!counts.includes(n)) {
        return {
          ok: false, installments: counts,
          error: counts.length
            ? `Este cartão não aceita ${n}x. Ele aceita até ${Math.max(...counts)}x: escolha outra quantidade de parcelas.`
            : "Este cartão não aceita parcelamento. Pague em 1x ou use outro cartão.",
        };
      }
    }
    pi = await s.paymentIntents.confirm(pi.id, {
      use_stripe_sdk: true,
      ...(n > 1 ? { payment_method_options: { card: { installments: { plan: { type: "fixed_count", count: n, interval: "month" } } } } } : {}),
    });
    if (pi.status === "succeeded" || pi.status === "processing") return { ok: true, status: pi.status === "succeeded" ? "succeeded" : "processing" };
    if (pi.status === "requires_action" && pi.client_secret) return { ok: true, status: "requires_action", clientSecret: pi.client_secret };
    return { ok: false, error: pi.last_payment_error ? stripeErrorMessage(pi.last_payment_error) : "O pagamento não foi aprovado. Tente de novo." };
  } catch (e) {
    console.error("stripe card", order.id, (e as Error).message);
    return { ok: false, error: stripeErrorMessage(e) };
  }
}

/** Cancela a cobrança pendente do pedido (quem volta do Pix para trocar a forma de pagamento). */
export async function cancelIntent(paymentIntentId: string) {
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "succeeded" || pi.status === "processing" || pi.status === "canceled") return pi.status;
    await stripe().paymentIntents.cancel(pi.id, { cancellation_reason: "abandoned" });
    return "canceled";
  } catch (e) {
    console.error("stripe cancel", paymentIntentId, (e as Error).message);
    return "error";
  }
}
