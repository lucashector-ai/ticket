"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { confirmPayment } from "@/lib/actions/compra";
import { releasePending } from "@/lib/payments/pending";
import { stripeEnabled } from "@/lib/payments/stripe";

const { orders } = schema;

export type CheckoutResult = { error?: string; redirect?: string };

/*
 * Página antiga do pedido (/checkout/[orderId]): só o modo de teste (sem Stripe) ou pedido grátis.
 * A emissão é a mesma do checkout do evento (fulfillOrder, via confirmPayment): limite por pessoa e CPF,
 * pré-venda usada, estoque menos as vagas seguradas, evento cancelado, idempotência. O caminho próprio que
 * existia aqui (e o createOrder sem limite por CPF, sem fila e sem pré-venda, que ninguém chamava) saiu.
 */
export async function payOrder(orderId: string): Promise<CheckoutResult> {
  const user = await getSessionUser();
  if (!user) return { redirect: "/entrar" };
  if (!z.string().uuid().safeParse(orderId).success) return { error: "Pedido não encontrado." };
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)), columns: { id: true, number: true, status: true, totalCents: true } });
  if (!order) return { error: "Pedido não encontrado." };
  if (order.status === "paid") return { redirect: `/meus-ingressos?pedido=${order.number}` };
  if (order.status !== "pending") return { error: "Este pedido não pode mais ser pago." };
  // com a Stripe ligada, pedido com valor só é pago de verdade (checkout do evento); aqui não há confirmação falsa
  if (stripeEnabled() && order.totalCents > 0) return { error: "Finalize a compra pelo checkout do evento, com Pix ou cartão." };
  const r = await confirmPayment(order.id);
  return r.ok ? { redirect: `/meus-ingressos?pedido=${r.number}` } : { error: r.error };
}

export async function payOrderForm(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const r = await payOrder(orderId);
  if (r.redirect) redirect(r.redirect);
  redirect(`/checkout/${orderId}?erro=${encodeURIComponent(r.error ?? "Erro")}`);
}

/** Cancela o pedido pendente e a cobrança já gerada (Pix/cartão); se ela já estiver sendo paga, o pedido segue. */
export async function cancelOrder(orderId: string) {
  const user = await getSessionUser();
  if (!user || !z.string().uuid().safeParse(orderId).success) return;
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)), columns: { id: true, status: true, stripePaymentIntentId: true } });
  if (order) await releasePending(order);
}
