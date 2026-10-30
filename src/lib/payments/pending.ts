import "server-only";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { cancelIntent, startPix } from "@/lib/payments/intents";
import { testPix } from "@/lib/payments/pix-test";
import { stripeEnabled } from "@/lib/payments/stripe";

/*
 * Pedido criado e ainda não pago (status pending, dentro dos 15 min da reserva).
 * Quem recarrega a página ou sai no meio do pagamento volta para ESTE pedido (mesmos itens, titulares,
 * total e o mesmo PaymentIntent da Stripe); um pedido novo do mesmo evento libera o anterior.
 */

const { orders } = schema;
type OrderRow = typeof orders.$inferSelect;
type Ref = { groupShareId: string | null; resaleListingId: string | null };

/** Pedido pendente (não vencido) do usuário para este evento e esta compra (normal, parte de grupo ou revenda). */
export async function pendingOrderFor(userId: string, eventId: string, ref: Ref) {
  const o = await db.query.orders.findFirst({
    where: and(
      eq(orders.userId, userId), eq(orders.eventId, eventId), eq(orders.status, "pending"), gt(orders.expiresAt, new Date()), isNull(orders.paidAt),
      ref.groupShareId ? eq(orders.groupShareId, ref.groupShareId) : isNull(orders.groupShareId),
      ref.resaleListingId ? eq(orders.resaleListingId, ref.resaleListingId) : isNull(orders.resaleListingId),
    ),
    orderBy: (x, { desc }) => [desc(x.createdAt)],
  });
  return o ?? null;
}

/**
 * Cancela um pedido pendente (e a cobrança da Stripe, se houver).
 * `paying`: a Stripe já está cobrando ou cobrou; o pedido fica como está e o webhook emite os ingressos.
 */
export async function releasePending(order: Pick<OrderRow, "id" | "status" | "stripePaymentIntentId">): Promise<"cancelled" | "paying" | "gone"> {
  if (order.status !== "pending") return "gone";
  if (order.stripePaymentIntentId && stripeEnabled()) {
    const st = await cancelIntent(order.stripePaymentIntentId);
    if (st !== "canceled") return "paying";
  }
  const r = await db.update(orders).set({ status: "cancelled" })
    .where(and(eq(orders.id, order.id), eq(orders.status, "pending"), isNull(orders.paidAt)))
    .returning({ id: orders.id });
  return r.length ? "cancelled" : "gone";
}

/** Libera os outros pedidos pendentes do mesmo evento/compra antes de criar um novo (nunca dois pedidos abertos). */
export async function releaseOthers(userId: string, eventId: string, ref: Ref): Promise<{ ok: true } | { ok: false; error: string }> {
  const open = await db.query.orders.findMany({
    where: and(
      eq(orders.userId, userId), eq(orders.eventId, eventId), eq(orders.status, "pending"),
      ref.groupShareId ? eq(orders.groupShareId, ref.groupShareId) : isNull(orders.groupShareId),
      ref.resaleListingId ? eq(orders.resaleListingId, ref.resaleListingId) : isNull(orders.resaleListingId),
    ),
    columns: { id: true, status: true, stripePaymentIntentId: true, expiresAt: true },
  });
  for (const o of open) {
    // vencido e sem cobrança na Stripe: só marca como expirado
    if (!o.stripePaymentIntentId && o.expiresAt && o.expiresAt < new Date()) {
      await db.update(orders).set({ status: "expired" }).where(and(eq(orders.id, o.id), eq(orders.status, "pending"), isNull(orders.paidAt)));
      continue;
    }
    if ((await releasePending(o)) === "paying") {
      return { ok: false, error: "Você tem um pagamento deste evento sendo confirmado agora. Confira em Meus ingressos em alguns instantes." };
    }
  }
  return { ok: true };
}

/** `secondsLeft`: calculado no servidor para o primeiro desenho do cronômetro (o navegador acerta depois). */
export type ResumePix = { pixCode: string; pixQrSvg: string; expiresAt: string | null; secondsLeft: number; live: boolean; testUrl: string | null };
export type ResumeCoupon = { code: string; percentOff: number; amountOffCents: number; amountPerTicket: boolean; sector: string | null };

/** O que o checkout precisa para continuar o pedido do ponto em que parou. */
export type ResumeData = {
  orderId: string;
  number: number;
  method: "pix" | "card" | "free";
  installments: number;
  totalCents: number;
  /** fim da reserva (ISO) e quantos segundos faltam */
  expiresAt: string;
  secondsLeft: number;
  items: { ticketTypeId: string; quantity: number; unitPriceCents: number }[];
  holders: { ticketTypeId: string; name: string; meia: boolean; me: boolean; email: string }[];
  buyer: { name: string; email: string; phone: string; cpf: string };
  /** a caixa "Quero receber novidades do produtor" estava marcada */
  producerOptIn: boolean;
  coupon: ResumeCoupon | null;
  /** Pix já gerado (o mesmo QR / copia e cola); null no cartão ou se não deu para recuperar */
  pix: ResumePix | null;
};

const secondsUntil = (d: Date | string | null | undefined) => (d ? Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 1000)) : 0);

export async function resumeView(order: OrderRow): Promise<ResumeData> {
  const [items, coupon] = await Promise.all([
    db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id), orderBy: [asc(schema.orderItems.id)] }),
    order.couponId ? db.query.coupons.findFirst({ where: eq(schema.coupons.id, order.couponId) }) : null,
  ]);
  const method = order.paymentMethod === "card" || order.paymentMethod === "free" ? order.paymentMethod : "pix";
  let pix: ResumePix | null = null;
  if (method === "pix" && order.totalCents > 0) {
    if (stripeEnabled()) {
      // o mesmo PaymentIntent: devolve o QR já gerado enquanto ele vale (nunca cria outro)
      const px = await startPix(order);
      if (px.ok) pix = { pixCode: px.pix.pixCode, pixQrSvg: px.pix.pixQrSvg, expiresAt: px.pix.expiresAt, secondsLeft: secondsUntil(px.pix.expiresAt), live: true, testUrl: px.pix.hostedUrl };
    } else {
      pix = { ...(await testPix(order.number ?? 0, order.totalCents)), expiresAt: order.expiresAt?.toISOString() ?? null, secondsLeft: secondsUntil(order.expiresAt), live: false, testUrl: null };
    }
  }
  const digits = order.buyerCpf ?? "";
  return {
    orderId: order.id, number: order.number ?? 0, method, installments: order.installments, totalCents: order.totalCents,
    expiresAt: (order.expiresAt ?? new Date()).toISOString(), secondsLeft: secondsUntil(order.expiresAt),
    items: items.map((i) => ({ ticketTypeId: i.ticketTypeId, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
    holders: (order.holders ?? []).map((h) => ({ ticketTypeId: h.ticketTypeId, name: h.name, meia: !!h.meia, me: !!h.me, email: h.email ?? "" })),
    buyer: {
      name: order.buyerName ?? "", email: order.buyerEmail ?? "", phone: order.buyerPhone ?? "",
      cpf: digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : digits,
    },
    producerOptIn: !!order.producerOptIn,
    coupon: coupon ? { code: coupon.code, percentOff: coupon.percentOff ?? 0, amountOffCents: coupon.amountOffCents ?? 0, amountPerTicket: coupon.amountPerTicket, sector: coupon.sector } : null,
    pix,
  };
}

/** Pedidos pendentes (não pagos e dentro da reserva) do usuário, para "Aguardando pagamento" em Meus ingressos. */
export async function listPendingOrders(userId: string) {
  return db.query.orders.findMany({
    where: and(eq(orders.userId, userId), eq(orders.status, "pending"), gt(orders.expiresAt, new Date()), isNull(orders.paidAt)),
    with: { event: { with: { venue: { with: { city: true } } } }, items: { with: { ticketType: { columns: { name: true, sector: true } } } } },
    orderBy: (x, { desc }) => [desc(x.createdAt)],
    limit: 10,
  });
}
