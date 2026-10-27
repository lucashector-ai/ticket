"use server";

import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { priceOrder, SERVICE_FEE_RATE } from "@/lib/pricing";
import { tierStatus } from "@/lib/tickets/status";
import { qrPayload } from "@/lib/actions/tickets";
import { canBuy } from "@/lib/launch";
import { promoterForOrder } from "@/lib/promoters";

const { orders, orderItems, tickets, ticketTypes, coupons, events, userProfiles, eventSignups } = schema;

const digits = (v: string) => v.replace(/\D/g, "");
const fullName = z.string().trim().refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "nome e sobrenome");

const placeSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(8) })).min(1),
  coupon: z.string().trim().toUpperCase().optional().nullable(),
  buyer: z.object({
    name: fullName,
    email: z.string().trim().email("e-mail"),
    phone: z.string().refine((v) => digits(v).length >= 10, "celular com DDD"),
    cpf: z.string().refine((v) => digits(v).length === 11, "CPF com 11 dígitos"),
  }),
  holders: z.array(z.object({ ticketTypeId: z.string().uuid(), name: fullName, meia: z.boolean() })),
  method: z.enum(["pix", "card"]),
  installments: z.number().int().min(1).max(6),
});
export type PlaceOrderInput = z.infer<typeof placeSchema>;

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; totalCents: number; pixCode: string; pixQrSvg: string }
  | { ok: false; error: string; needsLogin?: boolean };

async function findCoupon(code: string, eventId: string) {
  const c = await db.query.coupons.findFirst({ where: and(eq(coupons.code, code), eq(coupons.active, true)) });
  if (!c) return { ok: false as const, error: "Cupom inválido ou expirado." };
  if (c.expiresAt && c.expiresAt < new Date()) return { ok: false as const, error: "Cupom expirado." };
  if (c.maxUses != null && c.uses >= c.maxUses) return { ok: false as const, error: "Cupom esgotado." };
  if (c.eventId && c.eventId !== eventId) return { ok: false as const, error: "Cupom não vale para este evento." };
  return { ok: true as const, coupon: c };
}

/** Confere um cupom para o resumo do checkout (não exige login). */
export async function checkCoupon(code: string, eventSlug: string) {
  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), columns: { id: true } });
  if (!ev) return { ok: false as const, error: "Evento indisponível." };
  const r = await findCoupon(code.trim().toUpperCase(), ev.id);
  if (!r.ok) return r;
  return couponView(r.coupon);
}

function couponView(c: typeof coupons.$inferSelect) {
  return { ok: true as const, code: c.code, percentOff: c.percentOff ?? 0, amountOffCents: c.amountOffCents ?? 0, amountPerTicket: c.amountPerTicket, sector: c.sector };
}

function pixCopyPaste(orderNumber: number, totalCents: number) {
  const amount = (totalCents / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136onde-pagamentos-${orderNumber}5204000053039865406${amount}5802BR5904ONDE6009SAO PAULO62070503***6304A1F3`;
}

/** Cria o pedido com os dados do checkout. Exige login (pedido na etapa Dados). */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta para finalizar a compra.", needsLogin: true };
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    const missing = Array.from(new Set(parsed.error.issues.map((i) => i.message)));
    return { ok: false, error: `Falta preencher: ${missing.join(", ")}.` };
  }
  const { eventSlug, items, coupon, buyer, holders, method, installments } = parsed.data;

  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), with: { ticketTypes: true } });
  if (!ev || ev.status !== "published") return { ok: false, error: "Evento indisponível." };
  const access = await canBuy(ev);
  if (!access.ok) return { ok: false, error: access.phase === "presale" ? "A pré-venda é só para quem recebeu o link. A venda geral abre em breve." : "As vendas deste evento ainda não abriram." };
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (totalQty > ev.maxPerOrder) return { ok: false, error: `Máximo de ${ev.maxPerOrder} ingressos por pessoa.` };
  if (holders.length !== totalQty) return { ok: false, error: "Informe o titular de cada ingresso." };

  const lines = [];
  for (const it of items) {
    const tt = ev.ticketTypes.find((t) => t.id === it.ticketTypeId);
    if (!tt || tierStatus(tt) !== "open") return { ok: false, error: "Um dos lotes não está mais disponível." };
    if (tt.sold + it.quantity > tt.quantity) return { ok: false, error: `Restam só ${Math.max(0, tt.quantity - tt.sold)} ingressos em ${tt.name}.` };
    const forType = holders.filter((h) => h.ticketTypeId === tt.id).length;
    if (forType !== it.quantity) return { ok: false, error: "Informe o titular de cada ingresso." };
    lines.push({ ticketTypeId: tt.id, priceCents: tt.priceCents, quantity: it.quantity, sector: tt.sector, meiaOk: !tt.kind || tt.kind === "inteira" });
  }
  // meia só onde o checkout oferece (tipos de inteira); meia/social já têm preço próprio
  const meiaOk = new Map(lines.map((l) => [l.ticketTypeId, l.meiaOk]));
  const cleanHolders = holders.map((h) => ({ ...h, meia: h.meia && meiaOk.get(h.ticketTypeId) !== false }));

  let couponRow: typeof coupons.$inferSelect | null = null;
  if (coupon) {
    const c = await findCoupon(coupon, ev.id);
    if (!c.ok) return { ok: false, error: c.error };
    couponRow = c.coupon;
  }
  const feeRate = ev.absorbFee ? 0 : SERVICE_FEE_RATE;
  const p = priceOrder({ lines, holders: cleanHolders, coupon: couponRow ? couponView(couponRow) : null, method, installments, feeRate });
  // comissão do parceiro: % do valor dos ingressos (sem taxa e sem juros)
  const promoter = await promoterForOrder(ev);

  const [order] = await db.insert(orders).values({
    userId: user.id, eventId: ev.id, status: "pending",
    subtotalCents: p.subtotal, meiaCents: p.meia, discountCents: p.discount, feeCents: p.fee,
    interestCents: p.interest, installments: p.installments, totalCents: p.total,
    couponId: couponRow?.id ?? null, paymentMethod: method,
    buyerName: buyer.name.trim(), buyerEmail: buyer.email.trim().toLowerCase(), buyerPhone: digits(buyer.phone), buyerCpf: digits(buyer.cpf),
    holders: cleanHolders.map((h) => ({ ticketTypeId: h.ticketTypeId, name: h.name.trim(), meia: h.meia })),
    expiresAt: new Date(Date.now() + 15 * 60_000),
    presaleSignupId: access.presaleSignupId,
    promoterId: promoter?.id ?? null,
    commissionCents: promoter ? Math.round(((p.subtotal - p.meia - p.discount) * promoter.commissionPct) / 100) : 0,
  }).returning();
  await db.insert(orderItems).values(lines.map((l) => ({
    orderId: order.id, ticketTypeId: l.ticketTypeId, quantity: l.quantity, unitPriceCents: l.priceCents,
    unitFeeCents: Math.round(l.priceCents * feeRate),
  })));

  // guarda celular e CPF no perfil para preencher da próxima vez
  await db.insert(userProfiles).values({ userId: user.id, name: buyer.name.trim(), email: user.email ?? buyer.email, phone: digits(buyer.phone), cpf: digits(buyer.cpf) })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { name: buyer.name.trim(), phone: digits(buyer.phone), cpf: digits(buyer.cpf) } });

  const number = order.number ?? 0;
  const pixCode = pixCopyPaste(number, p.total);
  const pixQrSvg = method === "pix" ? await QRCode.toString(pixCode, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : "";
  return { ok: true, orderId: order.id, number, totalCents: p.total, pixCode, pixQrSvg };
}

function ticketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `TW-${s.slice(0, 4)}-${s.slice(4)}`;
}

export type ConfirmResult =
  | { ok: true; number: number; totalCents: number; method: "pix" | "card"; installments: number; ticketCount: number; firstCode: string; ticketQrSvg: string; email: string }
  | { ok: false; error: string };

/** Confirma o pagamento (ambiente de teste: sem gateway) e emite os ingressos nominais. */
export async function confirmPayment(orderId: string): Promise<ConfirmResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)), with: { items: true, tickets: true } });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  const method = (order.paymentMethod === "card" ? "card" : "pix") as "pix" | "card";
  if (order.status === "paid") {
    const first = order.tickets[0];
    return { ok: true, number: order.number ?? 0, totalCents: order.totalCents, method, installments: order.installments, ticketCount: order.tickets.length, firstCode: first?.code ?? "", ticketQrSvg: first ? await QRCode.toString(await qrPayload(first.code, first.secret), { type: "svg", margin: 0 }) : "", email: order.buyerEmail ?? "" };
  }
  if (order.status !== "pending") return { ok: false, error: "Este pedido não pode mais ser pago." };
  if (order.expiresAt && order.expiresAt < new Date()) {
    await db.update(orders).set({ status: "expired" }).where(eq(orders.id, order.id));
    return { ok: false, error: "O tempo da reserva acabou. Escolha os ingressos de novo." };
  }
  // link da pré-venda vale para uma compra só
  if (order.presaleSignupId) {
    const used = await db.update(eventSignups).set({ usedAt: new Date() })
      .where(and(eq(eventSignups.id, order.presaleSignupId), sql`${eventSignups.usedAt} is null`)).returning({ id: eventSignups.id });
    if (!used.length) return { ok: false, error: "Este link de pré-venda já foi usado em outra compra." };
  }
  for (const it of order.items) {
    const res = await db.update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${it.quantity}` })
      .where(and(eq(ticketTypes.id, it.ticketTypeId), sql`${ticketTypes.sold} + ${it.quantity} <= ${ticketTypes.quantity}`))
      .returning({ id: ticketTypes.id });
    if (!res.length) return { ok: false, error: "Os ingressos esgotaram enquanto você pagava. Tente outro lote." };
  }
  const holderQueue = [...(order.holders ?? [])];
  const rows = order.items.flatMap((it) => Array.from({ length: it.quantity }, () => {
    const idx = holderQueue.findIndex((h) => h.ticketTypeId === it.ticketTypeId);
    const h = idx >= 0 ? holderQueue.splice(idx, 1)[0] : null;
    return {
      code: ticketCode(), orderId: order.id, orderItemId: it.id, eventId: order.eventId, ticketTypeId: it.ticketTypeId,
      holderUserId: user.id, holderName: h?.name ?? order.buyerName ?? user.name ?? null, halfPrice: !!h?.meia,
      secret: randomBytes(16).toString("hex"),
    };
  }));
  const inserted = await db.insert(tickets).values(rows).returning({ code: tickets.code, secret: tickets.secret });
  if (order.couponId) await db.update(coupons).set({ uses: sql`${coupons.uses} + 1` }).where(eq(coupons.id, order.couponId));
  await db.update(orders).set({ status: "paid", paidAt: new Date(), paymentRef: `TEST-${order.number}` }).where(eq(orders.id, order.id));
  const first = inserted[0];
  return {
    ok: true, number: order.number ?? 0, totalCents: order.totalCents, method, installments: order.installments,
    ticketCount: inserted.length, firstCode: first.code,
    ticketQrSvg: await QRCode.toString(await qrPayload(first.code, first.secret), { type: "svg", margin: 0 }),
    email: order.buyerEmail ?? user.email ?? "",
  };
}
