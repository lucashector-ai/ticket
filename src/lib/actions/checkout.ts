"use server";

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

const { orders, orderItems, tickets, ticketTypes, coupons, events } = schema;

const selectionSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(8) })).min(1),
  coupon: z.string().trim().toUpperCase().optional(),
});
export type Selection = z.infer<typeof selectionSchema>;

export type CheckoutResult = { error?: string; redirect?: string };

/** Valida cupom. Retorna percentual/valor de desconto ou erro. */
export async function validateCoupon(code: string, eventId?: string) {
  const c = await db.query.coupons.findFirst({ where: and(eq(coupons.code, code.trim().toUpperCase()), eq(coupons.active, true)) });
  if (!c) return { ok: false as const, error: "Cupom inválido ou expirado." };
  if (c.expiresAt && c.expiresAt < new Date()) return { ok: false as const, error: "Cupom expirado." };
  if (c.maxUses != null && c.uses >= c.maxUses) return { ok: false as const, error: "Cupom esgotado." };
  if (c.eventId && eventId && c.eventId !== eventId) return { ok: false as const, error: "Cupom não vale para este evento." };
  return { ok: true as const, id: c.id, code: c.code, percentOff: c.percentOff ?? 0, amountOffCents: c.amountOffCents ?? 0 };
}

/** Cria o pedido (pendente) a partir da seleção e redireciona para o checkout. */
export async function createOrder(input: Selection): Promise<CheckoutResult> {
  const user = await getSessionUser();
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return { error: "Seleção inválida." };
  const { eventSlug, items, coupon } = parsed.data;
  if (!user) return { redirect: `/entrar?next=${encodeURIComponent(`/eventos/${eventSlug}`)}` };

  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), with: { ticketTypes: true } });
  if (!ev || ev.status !== "published") return { error: "Evento indisponível." };
  const total = items.reduce((s, i) => s + i.quantity, 0);
  if (total > ev.maxPerOrder) return { error: `Máximo de ${ev.maxPerOrder} ingressos por pessoa.` };

  let subtotal = 0, fees = 0;
  const lines: { ticketTypeId: string; quantity: number; unitPriceCents: number; unitFeeCents: number }[] = [];
  for (const it of items) {
    const tt = ev.ticketTypes.find((t) => t.id === it.ticketTypeId);
    if (!tt || tt.status !== "open") return { error: "Um dos lotes não está mais disponível." };
    if (tt.sold + it.quantity > tt.quantity) return { error: `Restam só ${Math.max(0, tt.quantity - tt.sold)} ingressos em ${tt.name}.` };
    subtotal += tt.priceCents * it.quantity;
    fees += tt.feeCents * it.quantity;
    lines.push({ ticketTypeId: tt.id, quantity: it.quantity, unitPriceCents: tt.priceCents, unitFeeCents: tt.feeCents });
  }
  let discount = 0, couponId: string | null = null;
  if (coupon) {
    const c = await validateCoupon(coupon, ev.id);
    if (!c.ok) return { error: c.error };
    discount = Math.min(subtotal, Math.round(subtotal * (c.percentOff / 100)) + c.amountOffCents);
    couponId = c.id;
  }
  const [order] = await db.insert(orders).values({
    userId: user.id, eventId: ev.id, status: "pending", subtotalCents: subtotal, feeCents: fees, discountCents: discount,
    totalCents: subtotal + fees - discount, couponId, buyerName: user.name ?? null, buyerEmail: user.email ?? null,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }).returning();
  await db.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));
  return { redirect: `/checkout/${order.id}` };
}

function ticketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `TW-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Confirma o pagamento (modo teste: sem gateway) e emite os ingressos. */
export async function payOrder(orderId: string, method: "pix" | "card" | "test" = "test"): Promise<CheckoutResult> {
  const user = await getSessionUser();
  if (!user) return { redirect: "/entrar" };
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)), with: { items: true, tickets: true } });
  if (!order) return { error: "Pedido não encontrado." };
  if (order.status === "paid") return { redirect: `/meus-ingressos?pedido=${order.number}` };
  if (order.status !== "pending") return { error: "Este pedido não pode mais ser pago." };
  if (order.expiresAt && order.expiresAt < new Date()) {
    await db.update(orders).set({ status: "expired" }).where(eq(orders.id, order.id));
    return { error: "O pedido expirou. Faça a seleção de novo." };
  }
  // reserva estoque (verificação otimista por lote)
  for (const it of order.items) {
    const res = await db.update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${it.quantity}` })
      .where(and(eq(ticketTypes.id, it.ticketTypeId), sql`${ticketTypes.sold} + ${it.quantity} <= ${ticketTypes.quantity}`))
      .returning({ id: ticketTypes.id });
    if (!res.length) return { error: "Ingressos esgotaram enquanto você finalizava. Tente outro lote." };
  }
  const rows = order.items.flatMap((it) => Array.from({ length: it.quantity }, () => ({
    code: ticketCode(), orderId: order.id, orderItemId: it.id, eventId: order.eventId, ticketTypeId: it.ticketTypeId,
    holderUserId: user.id, holderName: user.name ?? order.buyerName ?? null, secret: randomBytes(16).toString("hex"),
  })));
  await db.insert(tickets).values(rows);
  if (order.couponId) await db.update(coupons).set({ uses: sql`${coupons.uses} + 1` }).where(eq(coupons.id, order.couponId));
  await db.update(orders).set({ status: "paid", paidAt: new Date(), paymentMethod: method, paymentRef: `TEST-${order.number}` }).where(eq(orders.id, order.id));
  return { redirect: `/meus-ingressos?pedido=${order.number}` };
}

export async function payOrderForm(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const method = (String(formData.get("method") ?? "test") as "pix" | "card" | "test");
  const r = await payOrder(orderId, method);
  if (r.redirect) redirect(r.redirect);
  redirect(`/checkout/${orderId}?erro=${encodeURIComponent(r.error ?? "Erro")}`);
}

export async function cancelOrder(orderId: string) {
  const user = await getSessionUser();
  if (!user) return;
  await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, orderId), eq(orders.userId, user.id), eq(orders.status, "pending")));
}
