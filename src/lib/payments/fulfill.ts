import "server-only";
import { after } from "next/server";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/actions/tickets";
import { heldSql } from "@/lib/holds";
import { settleShare, shareStillHeld } from "@/lib/special";
import { mailGroupSharePaid, mailOrderConfirmed, mailResaleSold, mailTransferSent } from "@/lib/notify";
import { refundOrder } from "@/lib/payments/refund";

/*
 * Emissão dos ingressos de um pedido pago: a MESMA rotina para o webhook da Stripe, para a conferência
 * que o checkout faz depois do pagamento, para pedidos grátis e para o modo de teste (sem Stripe).
 *
 * Idempotente e segura com chamadas simultâneas (webhook + navegador): quem conseguir "pegar" o pedido
 * (paid_at gravado num pedido ainda não pago) faz o trabalho; os outros recebem `busy` e conferem de novo.
 *
 * `charged`: o dinheiro já saiu da conta de quem comprou (Stripe confirmou). Nesse caso a reserva vencida
 * não impede a emissão (se ainda houver lugar), e qualquer motivo para não emitir gera estorno automático.
 */

const { orders, orderItems, tickets, ticketTypes, coupons, eventSignups, groupShares, resaleListings, ticketTransfers } = schema;

type Method = "pix" | "card" | "free";
/** `sentTo`: ingressos de outras pessoas, enviados por e-mail (cada uma aceita com a própria conta). */
export type FulfillOk = { ok: true; number: number; totalCents: number; method: Method; installments: number; ticketCount: number; firstCode: string; ticketQrSvg: string; email: string; sentTo: SentTo[] };
export type SentTo = { name: string; email: string };
/** `busy`: outra chamada está emitindo agora; `retry`: falhou algo que vale tentar de novo (ex.: o estorno). */
export type FulfillResult = FulfillOk | { ok: false; error: string; busy?: boolean; refunded?: boolean; retry?: boolean };

type OrderRow = typeof orders.$inferSelect;
type ItemRow = typeof orderItems.$inferSelect;

/** Uma tentativa travada há mais que isso (o Worker caiu no meio) pode ser retomada. */
const CLAIM_STALE_MS = 2 * 60_000;

const methodOf = (o: OrderRow): Method => (o.paymentMethod === "card" || o.paymentMethod === "free" ? o.paymentMethod : "pix");

function ticketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `TW-${s.slice(0, 4)}-${s.slice(4)}`;
}

const qrSvg = async (code: string, secret: string) => QRCode.toString(await qrPayload(code, secret), { type: "svg", margin: 0 });

/**
 * Ingressos que a pessoa já comprou de cada tipo (pedidos pagos), para o limite por pessoa.
 * Conta pela conta e também pelo CPF do comprador, para o limite valer mesmo com outra conta.
 * `all`: tudo que conta para o limite; `mine`: só os desta conta (o resto veio do mesmo CPF em outra conta).
 */
export type Bought = Map<string, { all: number; mine: number }>;
export async function boughtByType(userId: string, cpf: string | null, typeIds: string[], exceptOrderId?: string): Promise<Bought> {
  if (!typeIds.length) return new Map();
  const rows = await db.select({
    id: orderItems.ticketTypeId,
    all: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
    mine: sql<number>`coalesce(sum(case when ${orders.userId} = ${userId} then ${orderItems.quantity} else 0 end), 0)`,
  })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      cpf && cpf.length === 11 ? or(eq(orders.userId, userId), eq(orders.buyerCpf, cpf)) : eq(orders.userId, userId),
      eq(orders.status, "paid"), inArray(orderItems.ticketTypeId, typeIds),
      sql`${orders.groupShareId} is null and ${orders.resaleListingId} is null`,
      exceptOrderId ? ne(orders.id, exceptOrderId) : undefined,
    ))
    .groupBy(orderItems.ticketTypeId);
  return new Map(rows.map((r) => [r.id, { all: Number(r.all), mine: Number(r.mine) }]));
}

/** Confere o limite por pessoa de cada tipo; devolve a mensagem de erro (dizendo de onde vem a conta) ou null. */
export function overLimit(items: { ticketTypeId: string; quantity: number }[], types: { id: string; name: string; maxPerOrder: number }[], bought: Bought) {
  for (const it of items) {
    const tt = types.find((t) => t.id === it.ticketTypeId);
    if (!tt) continue;
    const { all: had, mine } = bought.get(tt.id) ?? { all: 0, mine: 0 };
    if (had + it.quantity > tt.maxPerOrder) {
      const lim = `O limite é ${tt.maxPerOrder} ${tt.maxPerOrder === 1 ? "ingresso" : "ingressos"} de ${tt.name} por pessoa, conferido pela conta e pelo CPF.`;
      if (!had) return lim;
      const left = Math.max(0, tt.maxPerOrder - had);
      const rest = left ? ` Você ainda pode comprar ${left}.` : " Não dá para comprar mais deste tipo.";
      const other = had - mine;
      if (!other) return `${lim} Esta conta já tem ${had}.${rest}`;
      return `${lim} Já existem ${had} ${had === 1 ? "ingresso" : "ingressos"} deste tipo comprados com o CPF informado${mine ? ` (${mine} nesta conta e ${other} em outra conta)` : ", em outra conta"}.${rest} Se não foi você, fale com a Tickets Win.`;
    }
  }
  return null;
}

/** Resumo de um pedido já pago (para a tela de confirmação). */
export async function paidView(orderId: string): Promise<FulfillOk | null> {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { tickets: true } });
  if (!o || o.status !== "paid") return null;
  const gifts = o.tickets.length ? await db.query.ticketTransfers.findMany({
    where: and(inArray(ticketTransfers.ticketId, o.tickets.map((t) => t.id)), eq(ticketTransfers.kind, "gift"), ne(ticketTransfers.status, "cancelled")),
    columns: { ticketId: true, toEmail: true },
  }) : [];
  const gifted = new Map(gifts.map((g) => [g.ticketId, g.toEmail]));
  // o QR da tela é de um ingresso que ficou com quem comprou (os enviados não valem até a pessoa aceitar)
  const first = o.tickets.find((t) => !gifted.has(t.id) && t.holderUserId === o.userId) ?? null;
  return {
    ok: true, number: o.number ?? 0, totalCents: o.totalCents, method: methodOf(o), installments: o.installments, ticketCount: o.tickets.length,
    firstCode: first?.code ?? o.tickets[0]?.code ?? "", ticketQrSvg: first ? await qrSvg(first.code, first.secret) : "", email: o.buyerEmail ?? "",
    sentTo: o.tickets.filter((t) => gifted.has(t.id)).map((t) => ({ name: t.holderName ?? "", email: gifted.get(t.id)! })),
  };
}

/**
 * Ingressos de outras pessoas (titular com e-mail no checkout): o ingresso nasce na conta de quem comprou,
 * travado (status transferred) e com um link de entrega (ticket_transfers kind "gift") para o e-mail do titular.
 * Quando a pessoa entra com esse e-mail e aceita, ele vai para a conta dela com um QR novo. Não depende de o
 * produtor permitir transferências: faz parte da compra.
 */
async function startGifts(fromUserId: string, list: { ticketId: string; email: string }[]): Promise<string[]> {
  if (!list.length) return [];
  const trs = await db.insert(ticketTransfers).values(list.map((g) => ({
    ticketId: g.ticketId, fromUserId, toEmail: g.email, token: randomBytes(24).toString("hex"), status: "pending" as const, kind: "gift",
  }))).returning({ id: ticketTransfers.id });
  await db.update(tickets).set({ status: "transferred" }).where(inArray(tickets.id, list.map((g) => g.ticketId)));
  return trs.map((t) => t.id);
}

/**
 * Confirma o pedido e emite os ingressos nominais.
 * `ref`: o que vai em orders.payment_ref (STRIPE-pi_…, TEST-…, FREE-…).
 */
export async function fulfillOrder(orderId: string, pay: { ref: string; charged: boolean }): Promise<FulfillResult> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === "paid") return (await paidView(order.id)) ?? { ok: false, error: "Pedido não encontrado." };
  // cobrado de verdade: mesmo com a reserva vencida (ou o pedido cancelado na tela) tenta emitir; senão, só pendente
  const allowed = pay.charged ? (["pending", "expired", "cancelled"] as const) : (["pending"] as const);
  if (!(allowed as readonly string[]).includes(order.status)) {
    return { ok: false, error: order.status === "refunded" ? "Este pedido foi reembolsado." : "Este pedido não pode mais ser pago." };
  }
  if (!pay.charged && order.expiresAt && order.expiresAt < new Date()) {
    await db.update(orders).set({ status: "expired" }).where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    return { ok: false, error: "O tempo da reserva acabou. Escolha os ingressos de novo." };
  }

  // trava o pedido para esta tentativa (webhook e navegador podem chegar juntos)
  const claimed = await db.update(orders).set({ paidAt: new Date() })
    .where(and(
      eq(orders.id, order.id), inArray(orders.status, [...allowed]),
      or(isNull(orders.paidAt), lt(orders.paidAt, new Date(Date.now() - CLAIM_STALE_MS))),
    ))
    .returning({ id: orders.id });
  if (!claimed.length) {
    const view = await paidView(order.id);
    return view ?? { ok: false, busy: true, error: "Confirmando o pagamento…" };
  }

  const undo: (() => Promise<unknown>)[] = [];
  /** Não deu para emitir: desfaz o que já foi feito; se houve cobrança, estorna e avisa por e-mail. */
  const fail = async (why: string): Promise<FulfillResult> => {
    for (const u of undo.reverse()) await u().catch((e) => console.error("fulfill undo", order.id, e));
    if (pay.charged) {
      const r = await refundOrder(order.id, { email: `Não conseguimos concluir o seu pedido: ${why.replace(/\.$/, "")}.` });
      if (!r.ok) {
        // estorno falhou: o pedido fica travado (paid_at) e aparece no log para estorno manual
        console.error("fulfill: estorno automático falhou", order.id, r.error);
        return { ok: false, retry: true, error: `${why} Vamos estornar o valor pago e avisar por e-mail.` };
      }
      return { ok: false, refunded: true, error: `${why} O valor pago foi estornado automaticamente.` };
    }
    await db.update(orders).set({ status: "cancelled", paidAt: null }).where(eq(orders.id, order.id));
    return { ok: false, error: `${why} Nada foi cobrado.` };
  };

  // evento cancelado pelo produtor enquanto a pessoa pagava (ex.: Pix pago depois): não emite, estorna
  const evState = await db.query.events.findFirst({ where: eq(schema.events.id, order.eventId), columns: { status: true } });
  if (evState?.status === "cancelled") return fail("O evento foi cancelado pelo produtor.");
  if (!order.groupShareId && !order.resaleListingId) {
    // limite por pessoa de novo na confirmação: outro pedido pode ter sido pago no meio do caminho
    const types = await db.query.ticketTypes.findMany({ where: inArray(ticketTypes.id, order.items.map((i) => i.ticketTypeId)), columns: { id: true, name: true, maxPerOrder: true } });
    const limitErr = overLimit(order.items, types, await boughtByType(order.userId, order.buyerCpf, types.map((t) => t.id), order.id));
    if (limitErr) return fail(limitErr);
  }
  // link da pré-venda vale para uma compra só
  if (order.presaleSignupId) {
    const used = await db.update(eventSignups).set({ usedAt: new Date() })
      .where(and(eq(eventSignups.id, order.presaleSignupId), sql`${eventSignups.usedAt} is null`)).returning({ id: eventSignups.id });
    if (!used.length) return fail("Este link de pré-venda já foi usado em outra compra.");
    const signupId = order.presaleSignupId;
    undo.push(() => db.update(eventSignups).set({ usedAt: null }).where(eq(eventSignups.id, signupId)));
  }
  if (order.resaleListingId) return fulfillResale(order, pay, fail);
  if (order.groupShareId) {
    const sh = await db.query.groupShares.findFirst({ where: eq(groupShares.id, order.groupShareId), columns: { paidAt: true, userId: true } });
    if (!sh || sh.paidAt || sh.userId !== order.userId) return fail("Esta parte do grupo já foi paga ou passou para outra pessoa.");
  }
  // parte de grupo com a vaga ainda segurada: entra direto; senão disputa o estoque (descontando as vagas seguradas)
  const held = order.groupShareId ? await shareStillHeld(order.groupShareId) : false;
  for (const it of order.items) {
    const res = await db.update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${it.quantity}` })
      .where(and(eq(ticketTypes.id, it.ticketTypeId), held ? sql`true` : sql`${ticketTypes.sold} + ${it.quantity} + ${heldSql(ticketTypes.id, order.groupShareId)} <= ${ticketTypes.quantity}`))
      .returning({ id: ticketTypes.id });
    if (!res.length) return fail(pay.charged && order.expiresAt && order.expiresAt < new Date()
      ? "A reserva venceu antes da confirmação do pagamento e os ingressos esgotaram."
      : "Os ingressos esgotaram enquanto você pagava.");
    undo.push(() => db.update(ticketTypes).set({ sold: sql`greatest(${ticketTypes.sold} - ${it.quantity}, 0)` }).where(eq(ticketTypes.id, it.ticketTypeId)));
  }
  const holderQueue = [...(order.holders ?? [])];
  const giftTo = new Map<string, { name: string; email: string }>();
  const rows = order.items.flatMap((it) => Array.from({ length: it.quantity }, () => {
    const idx = holderQueue.findIndex((h) => h.ticketTypeId === it.ticketTypeId);
    const h = idx >= 0 ? holderQueue.splice(idx, 1)[0] : null;
    const code = ticketCode();
    if (h && !h.me && h.email) giftTo.set(code, { name: h.name, email: h.email });
    return {
      code, orderId: order.id, orderItemId: it.id, eventId: order.eventId, ticketTypeId: it.ticketTypeId,
      holderUserId: order.userId, holderName: h?.name ?? order.buyerName ?? null, halfPrice: !!h?.meia,
      secret: randomBytes(16).toString("hex"),
    };
  }));
  const inserted = await db.insert(tickets).values(rows).returning({ id: tickets.id, code: tickets.code, secret: tickets.secret });
  const gifts = await startGifts(order.userId, inserted.filter((t) => giftTo.has(t.code)).map((t) => ({ ticketId: t.id, email: giftTo.get(t.code)!.email })));
  if (order.couponId) await db.update(coupons).set({ uses: sql`${coupons.uses} + 1` }).where(eq(coupons.id, order.couponId));
  await db.update(orders).set({ status: "paid", paidAt: new Date(), paymentRef: pay.ref }).where(eq(orders.id, order.id));
  if (order.groupShareId) await settleShare(order.groupShareId, order.id);
  const shareId = order.groupShareId;
  after(async () => {
    await mailOrderConfirmed(order.id);
    for (const id of gifts) await mailTransferSent(id);
    if (shareId) await mailGroupSharePaid(shareId);
  });
  const first = inserted.find((t) => !giftTo.has(t.code)) ?? null;
  return {
    ok: true, number: order.number ?? 0, totalCents: order.totalCents, method: methodOf(order), installments: order.installments,
    ticketCount: inserted.length, firstCode: first?.code ?? inserted[0].code, ticketQrSvg: first ? await qrSvg(first.code, first.secret) : "", email: order.buyerEmail ?? "",
    sentTo: [...giftTo.values()],
  };
}

/** Revenda: o ingresso do vendedor passa para o comprador com um QR novo (o antigo deixa de valer). */
async function fulfillResale(order: OrderRow & { items: ItemRow[] }, pay: { ref: string; charged: boolean }, fail: (why: string) => Promise<FulfillResult>): Promise<FulfillResult> {
  const userId = order.userId;
  const l = await db.query.resaleListings.findFirst({ where: eq(resaleListings.id, order.resaleListingId!), with: { ticket: true, event: { columns: { title: true, slug: true } } } });
  const gone = "Este ingresso não está mais à venda.";
  if (!l || l.status === "sold" || l.status === "cancelled" || l.ticket.status !== "valid" || l.ticket.holderUserId !== l.sellerUserId) return fail(gone);
  if (l.status === "reserved" && l.reservedBy !== userId && l.reservedUntil && l.reservedUntil > new Date()) return fail(gone);
  const sold = await db.update(resaleListings).set({ status: "sold", buyerUserId: userId, orderId: order.id, soldAt: new Date() })
    .where(and(eq(resaleListings.id, l.id), sql`${resaleListings.status} in ('active', 'reserved')`)).returning({ id: resaleListings.id });
  if (!sold.length) return fail(gone);
  const holder = order.holders?.[0]?.name ?? order.buyerName ?? null;
  const [t] = await db.update(tickets)
    .set({ holderUserId: userId, holderName: holder, secret: randomBytes(16).toString("hex"), orderId: order.id, orderItemId: order.items[0]?.id ?? null })
    .where(and(eq(tickets.id, l.ticketId), eq(tickets.holderUserId, l.sellerUserId), eq(tickets.status, "valid")))
    .returning({ id: tickets.id, code: tickets.code, secret: tickets.secret });
  if (!t) {
    await db.update(resaleListings).set({ status: "cancelled" }).where(eq(resaleListings.id, l.id));
    return fail(gone);
  }
  await db.update(ticketTransfers).set({ status: "cancelled" }).where(and(eq(ticketTransfers.ticketId, l.ticketId), eq(ticketTransfers.status, "pending")));
  // comprou para outra pessoa: vai por e-mail, como na compra normal
  const h = order.holders?.[0];
  const gift = h && !h.me && h.email ? { name: h.name, email: h.email } : null;
  const gifts = gift ? await startGifts(userId, [{ ticketId: t.id, email: gift.email }]) : [];
  await db.update(orders).set({ status: "paid", paidAt: new Date(), paymentRef: pay.ref }).where(eq(orders.id, order.id));
  after(async () => {
    await mailOrderConfirmed(order.id);
    for (const id of gifts) await mailTransferSent(id);
    await mailResaleSold(l.sellerUserId, l.event.title, l.priceCents);
  });
  return {
    ok: true, number: order.number ?? 0, totalCents: order.totalCents, method: methodOf(order), installments: order.installments, ticketCount: 1,
    firstCode: t.code, ticketQrSvg: gift ? "" : await qrSvg(t.code, t.secret), email: order.buyerEmail ?? "", sentTo: gift ? [gift] : [],
  };
}
