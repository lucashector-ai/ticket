"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { fulfillOrder, paidView, type FulfillOk } from "@/lib/payments/fulfill";
import { cancelIntent, chargeCard } from "@/lib/payments/intents";
import { stripe, stripeEnabled, stripeErrorMessage, stripeRef } from "@/lib/payments/stripe";

/*
 * Pagamento pela Stripe dentro do checkout. O pedido só vira pago quando a Stripe confirma: pelo webhook
 * (/api/webhooks/stripe) ou por checkPayment, que consulta o PaymentIntent e usa a mesma emissão idempotente.
 */

const { orders } = schema;
const id = z.string().uuid();

async function ownOrder(orderId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Sua sessão expirou. Entre de novo." } as const;
  if (!id.safeParse(orderId).success) return { error: "Pedido não encontrado." } as const;
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)) });
  if (!order) return { error: "Pedido não encontrado." } as const;
  return { order } as const;
}

export type PayCardResult =
  | { ok: true; status: "paid"; result: FulfillOk }
  | { ok: true; status: "requires_action"; clientSecret: string }
  | { ok: true; status: "processing" }
  | { ok: false; error: string; installments?: number[] };

/** Cobra o cartão (PaymentMethod criado pelo Payment Element) no pedido pendente. */
export async function payCard(orderId: string, paymentMethodId: string): Promise<PayCardResult> {
  if (!stripeEnabled()) return { ok: false, error: "Pagamento com cartão indisponível no momento." };
  if (typeof paymentMethodId !== "string" || !/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) return { ok: false, error: "Confira os dados do cartão." };
  const r = await ownOrder(orderId);
  if ("error" in r) return { ok: false, error: r.error! };
  const { order } = r;
  if (order.status === "paid") {
    const v = await paidView(order.id);
    if (v) return { ok: true, status: "paid", result: v };
  }
  if (order.status !== "pending") return { ok: false, error: "Este pedido não pode mais ser pago. Escolha os ingressos de novo." };
  if (order.paymentMethod !== "card") return { ok: false, error: "Este pedido é de outra forma de pagamento." };
  if (order.expiresAt && order.expiresAt < new Date()) return { ok: false, error: "O tempo da reserva acabou. Escolha os ingressos de novo." };
  const step = await chargeCard(order, paymentMethodId);
  if (!step.ok) return step;
  if (step.status === "requires_action") return step;
  if (step.status === "processing") return { ok: true, status: "processing" };
  const done = await fulfillOrder(order.id, { ref: stripeRef(order.stripePaymentIntentId ?? (await piOf(order.id))), charged: true });
  if (done.ok) return { ok: true, status: "paid", result: done };
  if (done.busy) return { ok: true, status: "processing" };
  return { ok: false, error: done.error };
}

async function piOf(orderId: string) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), columns: { stripePaymentIntentId: true } });
  return o?.stripePaymentIntentId ?? "";
}

export type CheckResult =
  | { status: "paid"; result: FulfillOk }
  | { status: "pending" }
  | { status: "failed"; error: string }
  | { status: "closed"; error: string };

/** O checkout pergunta de tempos em tempos (Pix) ou depois do 3D Secure (cartão) se o pagamento já caiu. */
export async function checkPayment(orderId: string): Promise<CheckResult> {
  const r = await ownOrder(orderId);
  if ("error" in r) return { status: "closed", error: r.error! };
  const { order } = r;
  if (order.status === "paid") {
    const v = await paidView(order.id);
    return v ? { status: "paid", result: v } : { status: "pending" };
  }
  if (order.status === "refunded") return { status: "closed", error: "Não conseguimos concluir este pedido e o valor pago foi estornado. Veja o seu e-mail." };
  if (!stripeEnabled() || !order.stripePaymentIntentId) {
    return order.status === "pending" ? { status: "pending" } : { status: "closed", error: "Este pedido não pode mais ser pago. Escolha os ingressos de novo." };
  }
  try {
    const pi = await stripe().paymentIntents.retrieve(order.stripePaymentIntentId);
    if (pi.status === "succeeded") {
      const done = await fulfillOrder(order.id, { ref: stripeRef(pi.id), charged: true });
      if (done.ok) return { status: "paid", result: done };
      if (done.busy) return { status: "pending" };
      return { status: "closed", error: done.error };
    }
    if (pi.status === "canceled") return { status: "closed", error: "O código Pix expirou e nada foi cobrado. Escolha os ingressos de novo." };
    if (pi.status === "requires_payment_method" && pi.last_payment_error) return { status: "failed", error: stripeErrorMessage(pi.last_payment_error) };
    return { status: "pending" };
  } catch (e) {
    console.error("checkPayment", order.id, (e as Error).message);
    return { status: "pending" };
  }
}

/** Quem volta do Pix para trocar a forma de pagamento: cancela o código gerado e o pedido. */
export async function abandonPayment(orderId: string): Promise<{ ok: boolean }> {
  const r = await ownOrder(orderId);
  if ("error" in r) return { ok: false };
  const { order } = r;
  if (order.status !== "pending") return { ok: false };
  if (order.stripePaymentIntentId && stripeEnabled()) {
    const st = await cancelIntent(order.stripePaymentIntentId);
    // já pago (ou pagando): não cancela o pedido; o webhook emite os ingressos
    if (st !== "canceled") return { ok: false };
  }
  await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, order.id), inArray(orders.status, ["pending"])));
  return { ok: true };
}
