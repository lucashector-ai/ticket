"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { cpfValid } from "@/lib/cpf";
import { ensureCustomer, ownCard } from "@/lib/payments/cards";
import { eventClosedFor, fulfillOrder, paidView, type FulfillOk } from "@/lib/payments/fulfill";
import { chargeCard } from "@/lib/payments/intents";
import { releasePending } from "@/lib/payments/pending";
import { paidOf, stripe, stripeEnabled, stripeErrorMessage, stripeRef } from "@/lib/payments/stripe";

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

/**
 * `paymentMethodId`: cartão novo (criado agora no Payment Element) ou um cartão salvo da conta.
 * `save`: salvar o cartão novo para as próximas compras. `holder`: o cartão é de outra pessoa (nome como no
 * cartão e CPF do titular). O CPF do titular vai só para o processador (metadata do pagamento), não para o
 * nosso banco: o pedido guarda o CPF de quem compra, que é o que conta para o limite por pessoa.
 */
const payCardSchema = z.object({
  orderId: id,
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]{6,64}$/),
  save: z.boolean().optional().default(false),
  holder: z.object({
    name: z.string().trim().min(3).max(80),
    cpf: z.string().transform((v) => v.replace(/\D/g, "")).refine(cpfValid),
  }).nullable().optional(),
});
export type PayCardInput = z.input<typeof payCardSchema>;

/** tentativas de cobrança no cartão por conta a cada hora (freia teste de cartões roubados) */
const CARD_TRIES_PER_HOUR = 10;

/** Conta mais uma tentativa; false quando já passou do limite. Sem KV (dev), não limita. */
async function cardTryAllowed(userId: string) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const key = `card-try:${userId}`;
    const n = Number((await env.KV.get(key)) ?? 0);
    if (n >= CARD_TRIES_PER_HOUR) return false;
    await env.KV.put(key, String(n + 1), { expirationTtl: 3600 });
  } catch { /* sem KV: segue */ }
  return true;
}

/** Cobra o cartão (novo, do Payment Element, ou salvo na conta) no pedido pendente. */
export async function payCard(input: PayCardInput): Promise<PayCardResult> {
  if (!stripeEnabled()) return { ok: false, error: "Pagamento com cartão indisponível no momento." };
  const p = payCardSchema.safeParse(input);
  if (!p.success) {
    const holderIssue = p.error.issues.some((i) => i.path[0] === "holder");
    return { ok: false, error: holderIssue ? "Confira o nome e o CPF do titular do cartão." : "Confira os dados do cartão." };
  }
  const { orderId, paymentMethodId, save, holder } = p.data;
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
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
  // evento cancelado ou que terminou depois da reserva: não cobra (a emissão recusaria e estornaria)
  const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id), columns: { ticketTypeId: true } });
  const closed = await eventClosedFor(order.eventId, items.map((i) => i.ticketTypeId));
  if (closed) return { ok: false, error: closed };
  if (!(await cardTryAllowed(user.id))) return { ok: false, error: "Muitas tentativas com cartão em pouco tempo. Aguarde um pouco ou pague com Pix." };

  // de quem é o cartão: um cartão já ligado a um cliente só passa se for o cliente desta conta
  let customerId: string | null = null;
  let metadata: Record<string, string>;
  try {
    const pm = await stripe().paymentMethods.retrieve(paymentMethodId);
    if (pm.type !== "card") return { ok: false, error: "Confira os dados do cartão." };
    const owner = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
    if (owner) {
      const own = await ownCard(user.id, paymentMethodId);
      if (!own) return { ok: false, error: "Este cartão não está salvo na sua conta. Escolha outro ou informe os dados de novo." };
      customerId = own.customerId;
      // cartão salvo: o titular é o que foi informado quando ele foi salvo
      const cpf = (pm.metadata?.holder_cpf ?? "").replace(/\D/g, "");
      const other = pm.metadata?.cardholder === "outra_pessoa" && cpfValid(cpf);
      metadata = { cardholder: other ? "outra_pessoa" : "comprador", holder_name: (pm.billing_details?.name ?? "").slice(0, 80), holder_cpf: other ? cpf : "", saved_card: "sim" };
    } else {
      if (save) customerId = await ensureCustomer({ id: user.id, email: user.email, name: order.buyerName ?? user.name });
      metadata = holder
        ? { cardholder: "outra_pessoa", holder_name: holder.name, holder_cpf: holder.cpf, saved_card: save ? "salvando" : "" }
        : { cardholder: "comprador", holder_name: (pm.billing_details?.name ?? "").slice(0, 80), holder_cpf: "", saved_card: save ? "salvando" : "" };
    }
  } catch (e) {
    console.error("payCard: cartão", order.id, (e as Error).message);
    return { ok: false, error: stripeErrorMessage(e) };
  }
  const step = await chargeCard(order, paymentMethodId, { customerId, save: save && !!customerId, metadata });
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
      const done = await fulfillOrder(order.id, { ref: stripeRef(pi.id), charged: true, paid: paidOf(pi) });
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

/**
 * Quem volta do Pix para trocar a forma de pagamento, cancela o pedido em Meus ingressos ou desiste da retomada:
 * cancela o código gerado (e o pedido). `paying`: a Stripe já está cobrando; o pedido segue e o webhook emite.
 */
export async function abandonPayment(orderId: string): Promise<{ ok: boolean; paying?: boolean; paid?: number }> {
  const r = await ownOrder(orderId);
  if ("error" in r) return { ok: false };
  const { order } = r;
  if (order.status === "paid") return { ok: false, paid: order.number ?? 0 };
  const st = await releasePending(order);
  if (st === "paying") return { ok: false, paying: true };
  revalidatePath("/meus-ingressos");
  return { ok: st === "cancelled" };
}
