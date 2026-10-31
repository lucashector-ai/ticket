import "server-only";
import { after } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { and, eq, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/tickets/qr";
import { heldSql } from "@/lib/holds";
import { ONE_SHARE, paidShareInGroup } from "@/lib/special";
import { mailGroupSharePaid, mailOrderConfirmed, mailResaleSold, mailTransferSent } from "@/lib/notify";
import { refundOrder } from "@/lib/payments/refund";
import { ticketCode } from "@/lib/tickets/code";
import { overLimit, type Bought } from "@/lib/tickets/limits";
import { abortOf as abortTx, ensure as ensureTx, lockKeys, runBatch } from "@/lib/payments/tx";
import { trailInsert } from "@/lib/tickets/trail";
import { meiaInOrder, meiaLockKey, meiaQuotaPaidOkSql, MEIA_SOLD_OUT } from "@/lib/meia-quota";
import { salesEndedError } from "@/lib/tickets/sales-end";
import type { PaidAmount } from "@/lib/payments/stripe";
import { couponPaidOkSql } from "@/lib/payments/coupon";

/*
 * Emissão dos ingressos de um pedido pago: a MESMA rotina para o webhook da Stripe, para a conferência
 * que o checkout faz depois do pagamento, para pedidos grátis e para o modo de teste (sem Stripe).
 *
 * Idempotente e segura com chamadas simultâneas (webhook + navegador): quem conseguir "pegar" o pedido
 * (paid_at gravado num pedido ainda não pago) faz o trabalho; os outros recebem `busy` e conferem de novo.
 * A gravação é uma transação só (ver `ensure` abaixo): uma queda no meio não deixa nada pela metade.
 *
 * `charged`: o dinheiro já saiu da conta de quem comprou (Stripe confirmou). Nesse caso a reserva vencida
 * não impede a emissão (se ainda houver lugar), e qualquer motivo para não emitir gera estorno automático.
 */

const { orders, orderItems, tickets, ticketTypes, coupons, eventSignups, groupShares, groupOrders, resaleListings, ticketTransfers } = schema;

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

const qrSvg = async (code: string, secret: string) => QRCode.toString(await qrPayload(code, secret), { type: "svg", margin: 0 });

/**
 * Ingressos que a pessoa já comprou de cada tipo (pedidos pagos), para o limite por pessoa.
 * Conta pela conta e também pelo CPF do comprador, para o limite valer mesmo com outra conta.
 * `all`: tudo que conta para o limite; `mine`: só os desta conta (o resto veio do mesmo CPF em outra conta).
 */
export type { Bought };
export { overLimit };
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

/*
 * A emissão grava tudo numa transação só (db.batch: o driver HTTP do Neon manda os comandos juntos e o banco
 * desfaz todos se um falhar). Não existe "meio caminho": ou o pedido fica pago com os ingressos, o estoque
 * baixado, o cupom contado e a parte do grupo quitada, ou nada disso acontece. Se o Worker cair no meio, a
 * nova tentativa começa do zero, sem baixar o estoque de novo.
 *
 * Conferências que dependem do que foi gravado (estoque, limite por pessoa, link de pré-venda, parte do
 * grupo) viram comandos `ensure` dentro da transação: quando não passam, provocam um erro proposital
 * (TW_ABORT:<motivo>) que desfaz tudo e diz o motivo.
 */
type Abort = "order" | "presale" | "share" | "share_one" | "stock" | "limit" | "listing" | "ticket" | "meia" | "coupon";
const ensure = (ok: SQL, why: Abort, withClause?: SQL) => ensureTx(ok, why, withClause);
const abortOf = (e: unknown) => abortTx(e) as Abort | null;

/**
 * Trava por pessoa (conta e CPF) até o fim da transação: duas confirmações da mesma pessoa, mesmo por contas
 * diferentes com o mesmo CPF, passam uma de cada vez pela conferência do limite. Ordem fixa (evita impasse).
 */
const lockPeople = lockKeys;

/** Marca o pedido como pago se ainda não estiver: a mesma confirmação em duas tentativas só vale uma vez. */
const markPaid = (orderId: string, ref: string, allowed: readonly string[]) => ensure(sql`(select count(*) from u) = 1`, "order", sql`
  with u as (
    update ${orders} set status = 'paid', payment_ref = ${ref}, updated_at = now()
    where id = ${orderId} and status in (${sql.join(allowed.map((a) => sql`${a}`), sql`, `)}) returning 1
  )`);


/** Se a transação falhou sem motivo nosso (rede, banco), solta a trava do pedido e repassa o erro. */
async function unknownFailure(orderId: string, e: unknown): Promise<FulfillResult> {
  // a transação inteira valeu ou não valeu: se valeu, o pedido já está pago
  const view = await paidView(orderId).catch(() => null);
  if (view) return view;
  // nada foi gravado: a próxima tentativa (webhook, conferência do checkout) pode começar já
  await db.update(orders).set({ paidAt: null }).where(and(eq(orders.id, orderId), ne(orders.status, "paid"))).catch(() => {});
  throw e;
}

/**
 * Ingressos de outras pessoas (titular com e-mail no checkout): o ingresso nasce na conta de quem comprou,
 * travado (status transferred) e com um link de entrega (ticket_transfers kind "gift") para o e-mail do titular.
 * Quando a pessoa entra com esse e-mail e aceita, ele vai para a conta dela com um QR novo. Não depende de o
 * produtor permitir transferências: faz parte da compra.
 */
const giftRows = (fromUserId: string, list: { ticketId: string; email: string }[]) => list.map((g) => ({
  id: randomUUID(), ticketId: g.ticketId, fromUserId, toEmail: g.email, token: randomBytes(24).toString("hex"), status: "pending" as const, kind: "gift",
}));

/**
 * O evento deixou de vender estes tipos de ingresso? (cancelado pelo produtor, ou o evento ou a data do ingresso
 * já terminou). Conferido na emissão e antes de cobrar o cartão. null = pode seguir.
 */
export async function eventClosedFor(eventId: string, typeIds: string[]): Promise<string | null> {
  const ev = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId), columns: { status: true, startAt: true, endAt: true },
    with: { sessions: { columns: { id: true, startAt: true } }, ticketTypes: { columns: { id: true, sessionId: true } } },
  });
  if (!ev) return null;
  if (ev.status === "cancelled") return "O evento foi cancelado pelo produtor.";
  return salesEndedError(ev, typeIds);
}

/** O valor e a moeda confirmados pela Stripe batem com o pedido? (o PaymentIntent é nosso, mas a emissão não confia nisso) */
export const paidMatchesOrder = (paid: PaidAmount, order: { totalCents: number }) =>
  paid.currency.toLowerCase() === "brl" && paid.amountCents === order.totalCents;

/**
 * Confirma o pedido e emite os ingressos nominais.
 * `ref`: o que vai em orders.payment_ref (STRIPE-pi_…, TEST-…, FREE-…).
 * `paid`: valor e moeda que a Stripe confirmou (webhook, conferência do checkout); se não baterem com o pedido,
 * nada é emitido e o valor pago volta (estorno automático, como em qualquer pagamento que não pôde virar ingresso).
 */
export async function fulfillOrder(orderId: string, pay: { ref: string; charged: boolean; paid?: PaidAmount }): Promise<FulfillResult> {
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

  /** Não deu para emitir (nada foi gravado): se houve cobrança, estorna e avisa por e-mail. */
  const fail = async (why: string): Promise<FulfillResult> => {
    if (pay.charged) {
      const r = await refundOrder(order.id, { email: `Não conseguimos concluir o seu pedido: ${why.replace(/\.$/, "")}.` });
      if (!r.ok) {
        // estorno falhou: o pedido fica travado (paid_at) e aparece no log para estorno manual
        console.error("fulfill: estorno automático falhou", order.id, r.error);
        return { ok: false, retry: true, error: `${why} Vamos estornar o valor pago e avisar por e-mail.` };
      }
      return { ok: false, refunded: true, error: `${why} O valor pago foi estornado automaticamente.` };
    }
    await db.update(orders).set({ status: "cancelled", paidAt: null }).where(and(eq(orders.id, order.id), ne(orders.status, "paid")));
    return { ok: false, error: `${why} Nada foi cobrado.` };
  };

  // valor ou moeda confirmados diferentes do pedido (não deveria acontecer: o PaymentIntent nasce com o total do
  // pedido): não emite e devolve o que foi pago; fica no log para conferência
  if (pay.paid && !paidMatchesOrder(pay.paid, order)) {
    console.error("fulfill: valor confirmado diferente do pedido", order.id, pay.paid.amountCents, pay.paid.currency, order.totalCents);
    return fail("O valor pago não confere com o pedido.");
  }
  // evento cancelado pelo produtor, ou que já terminou (o evento ou a data do ingresso), enquanto a pessoa pagava
  // (ex.: Pix pago depois): não emite; se houve cobrança, estorna (vale também para grupo e revenda)
  const closed = await eventClosedFor(order.eventId, order.items.map((i) => i.ticketTypeId));
  if (closed) return fail(closed);
  if (order.resaleListingId) return fulfillResale(order, pay, allowed, fail);
  const normal = !order.groupShareId;
  const cpf = order.buyerCpf && order.buyerCpf.length === 11 ? order.buyerCpf : null;
  const typeIds = [...new Set(order.items.map((i) => i.ticketTypeId))].sort();
  /** Mensagem do limite por pessoa (o que a pessoa já tem, nesta conta e no CPF). */
  const limitMsg = async () => {
    const types = await db.query.ticketTypes.findMany({ where: inArray(ticketTypes.id, typeIds), columns: { id: true, name: true, maxPerOrder: true } });
    return overLimit(order.items, types, await boughtByType(order.userId, order.buyerCpf, typeIds, order.id));
  };
  // conferências antes da transação, para responder com a mensagem certa sem gravar nada
  if (normal) {
    const limitErr = await limitMsg();
    if (limitErr) return fail(limitErr);
  }
  if (order.groupShareId) {
    const sh = await db.query.groupShares.findFirst({ where: eq(groupShares.id, order.groupShareId), columns: { paidAt: true, userId: true, groupId: true } });
    if (!sh || sh.paidAt || sh.userId !== order.userId) return fail("Esta parte do grupo já foi paga ou passou para outra pessoa.");
    if (await paidShareInGroup(sh.groupId, order.userId)) return fail(ONE_SHARE);
  }

  const holderQueue = [...(order.holders ?? [])];
  const giftTo = new Map<string, { name: string; email: string }>();
  const rows = order.items.flatMap((it) => Array.from({ length: it.quantity }, () => {
    const idx = holderQueue.findIndex((h) => h.ticketTypeId === it.ticketTypeId);
    const h = idx >= 0 ? holderQueue.splice(idx, 1)[0] : null;
    const id = randomUUID();
    if (h && !h.me && h.email) giftTo.set(id, { name: h.name, email: h.email });
    return {
      id, code: ticketCode(), orderId: order.id, orderItemId: it.id, eventId: order.eventId, ticketTypeId: it.ticketTypeId,
      holderUserId: order.userId, holderName: h?.name ?? order.buyerName ?? null, halfPrice: !!h?.meia,
      secret: randomBytes(16).toString("hex"), status: giftTo.has(id) ? ("transferred" as const) : ("valid" as const),
    };
  }));
  const gifts = giftRows(order.userId, rows.filter((t) => giftTo.has(t.id)).map((t) => ({ ticketId: t.id, email: giftTo.get(t.id)!.email })));
  const shareId = order.groupShareId;

  // cota de meia (40% por setor e data): conferida de novo na emissão, com os ingressos deste pedido já gravados
  const meiaTypes = await db.query.ticketTypes.findMany({ where: inArray(ticketTypes.id, typeIds), columns: { id: true, kind: true, sector: true, sessionId: true, quantity: true } });
  const meiaGroups = [...meiaInOrder(meiaTypes, order.items, order.holders ?? []).values()].map((x) => x.group);

  const steps: BatchItem<"pg">[] = [];
  // limite por pessoa (compra normal) e "uma parte por conta" (grupo): a mesma pessoa, uma confirmação por vez;
  // a meia do setor também, uma confirmação por vez (numa chamada só com as pessoas: ordem fixa, sem impasse)
  steps.push(lockPeople([`u:${order.userId}`, ...(normal && cpf ? [`c:${cpf}`] : []), ...meiaGroups.map((g) => meiaLockKey(order.eventId, g))]));
  steps.push(markPaid(order.id, pay.ref, allowed));
  // link da pré-venda vale para uma compra só
  if (order.presaleSignupId) {
    steps.push(ensure(sql`(select count(*) from u) = 1`, "presale", sql`
      with u as (update ${eventSignups} set used_at = now() where id = ${order.presaleSignupId} and used_at is null returning 1)`));
  }
  if (shareId) {
    steps.push(ensure(sql`not exists (
      select 1 from ${groupShares} a join ${groupShares} b on b.group_id = a.group_id
      where a.id = ${shareId} and b.id <> a.id and b.user_id = ${order.userId} and b.paid_at is not null)`, "share_one"));
    steps.push(ensure(sql`(select count(*) from u) = 1`, "share", sql`
      with u as (
        update ${groupShares} set paid_at = now(), order_id = ${order.id}
        where id = ${shareId} and paid_at is null and user_id = ${order.userId} returning 1
      )`));
    // todos pagaram: o grupo fecha
    steps.push(db.update(groupOrders).set({ status: "done" }).where(and(
      sql`${groupOrders.id} = (select group_id from ${groupShares} where id = ${shareId})`,
      sql`not exists (select 1 from ${groupShares} where group_id = ${groupOrders.id} and paid_at is null)`,
    )));
  }
  // baixa do estoque (ordem fixa por tipo: duas compras com os mesmos tipos não se travam uma à outra)
  const qty = new Map<string, number>();
  for (const it of order.items) qty.set(it.ticketTypeId, (qty.get(it.ticketTypeId) ?? 0) + it.quantity);
  for (const id of typeIds) steps.push(db.update(ticketTypes).set({ sold: sql`${ticketTypes.sold} + ${qty.get(id)}` }).where(eq(ticketTypes.id, id)));
  steps.push(db.insert(tickets).values(rows));
  if (gifts.length) steps.push(db.insert(ticketTransfers).values(gifts));
  // rastro (D-12): a emissão de cada ingresso (comprador e titular, valor do ingresso) e o envio por e-mail dos que
  // são de outra pessoa, na mesma transação
  const unit = new Map(order.items.map((i) => [i.id, i.unitPriceCents]));
  const codeOf = new Map<string, string>(rows.map((t) => [t.id, t.code]));
  steps.push(trailInsert([
    ...rows.map((t) => {
      const p = unit.get(t.orderItemId) ?? 0;
      return { ticketId: t.id, kind: "emitido" as const, code: t.code, fromUserId: order.userId, toUserId: order.userId, holderName: t.holderName, orderId: order.id, amountCents: p - (t.halfPrice ? Math.round(p / 2) : 0) };
    }),
    ...gifts.map((g) => ({ ticketId: g.ticketId, kind: "presente" as const, code: codeOf.get(g.ticketId) ?? null, fromUserId: order.userId, toEmail: g.toEmail, holderName: giftTo.get(g.ticketId)?.name ?? null, orderId: order.id, refId: g.id })),
  ]));
  if (order.couponId) {
    steps.push(db.update(coupons).set({ uses: sql`${coupons.uses} + 1` }).where(eq(coupons.id, order.couponId)));
    // limite de usos do cupom: os pedidos que reservaram um uso cabem; o que confirma depois da reserva vencida não
    steps.push(ensure(couponPaidOkSql(order.couponId), "coupon"));
  }
  // depois da baixa: vendidos + vagas seguradas por grupos cabem na lotação. Vale também para a parte de grupo: com a
  // vaga ainda segurada, ela sai das "seguradas" (paga acima) e entra nas vendidas, então a soma não muda e passa; com
  // o grupo vencido/cancelado no meio do caminho, ou o lote reduzido pelo produtor, disputa a lotação como qualquer
  // compra (antes entrava direto, conferido fora da transação, e podia vender acima da quantidade: SEC-104)
  steps.push(ensure(sql`not exists (
    select 1 from ${ticketTypes} where ${ticketTypes.id} in (${sql.join(typeIds.map((id) => sql`${id}`), sql`, `)})
    and ${ticketTypes.sold} + ${heldSql(ticketTypes.id)} > ${ticketTypes.quantity})`, "stock"));
  if (meiaGroups.length) steps.push(ensure(meiaQuotaPaidOkSql(order.eventId, meiaGroups), "meia"));
  // limite por pessoa com este pedido já pago (conta e CPF), conferido com a trava acima
  if (normal) {
    steps.push(ensure(sql`not exists (
      select 1 from ${orderItems} oi join ${orders} o on o.id = oi.order_id join ${ticketTypes} t on t.id = oi.ticket_type_id
      where o.status = 'paid' and ${cpf ? sql`(o.user_id = ${order.userId} or o.buyer_cpf = ${cpf})` : sql`o.user_id = ${order.userId}`}
        and o.group_share_id is null and o.resale_listing_id is null
        and oi.ticket_type_id in (${sql.join(typeIds.map((id) => sql`${id}`), sql`, `)})
      group by oi.ticket_type_id, t.max_per_order having sum(oi.quantity) > t.max_per_order)`, "limit"));
  }

  try {
    await runBatch(steps);
  } catch (e) {
    const why = abortOf(e);
    if (!why) return unknownFailure(order.id, e);
    // outra tentativa já confirmou este pedido
    if (why === "order") return (await paidView(order.id)) ?? { ok: false, busy: true, error: "Confirmando o pagamento…" };
    if (why === "presale") return fail("Este link de pré-venda já foi usado em outra compra.");
    if (why === "share") return fail("Esta parte do grupo já foi paga ou passou para outra pessoa.");
    if (why === "share_one") return fail(ONE_SHARE);
    if (why === "limit") return fail((await limitMsg()) ?? "Você chegou ao limite de ingressos por pessoa deste evento.");
    if (why === "meia") return fail(MEIA_SOLD_OUT);
    if (why === "coupon") return fail("O cupom deste pedido esgotou antes da confirmação do pagamento.");
    return fail(pay.charged && order.expiresAt && order.expiresAt < new Date()
      ? "A reserva venceu antes da confirmação do pagamento e os ingressos esgotaram."
      : "Os ingressos esgotaram enquanto você pagava.");
  }

  after(async () => {
    await mailOrderConfirmed(order.id);
    for (const g of gifts) await mailTransferSent(g.id);
    if (shareId) await mailGroupSharePaid(shareId);
  });
  const first = rows.find((t) => !giftTo.has(t.id)) ?? null;
  return {
    ok: true, number: order.number ?? 0, totalCents: order.totalCents, method: methodOf(order), installments: order.installments,
    ticketCount: rows.length, firstCode: first?.code ?? rows[0].code, ticketQrSvg: first ? await qrSvg(first.code, first.secret) : "", email: order.buyerEmail ?? "",
    sentTo: [...giftTo.values()],
  };
}

/** Revenda: o ingresso do vendedor passa para o comprador com QR e código novos (os antigos deixam de valer). */
async function fulfillResale(order: OrderRow & { items: ItemRow[] }, pay: { ref: string; charged: boolean }, allowed: readonly string[], fail: (why: string) => Promise<FulfillResult>): Promise<FulfillResult> {
  const userId = order.userId;
  const l = await db.query.resaleListings.findFirst({ where: eq(resaleListings.id, order.resaleListingId!), with: { ticket: true, event: { columns: { title: true, slug: true } } } });
  const gone = "Este ingresso não está mais à venda.";
  if (!l || l.status === "sold" || l.status === "cancelled" || l.ticket.status !== "valid" || l.ticket.holderUserId !== l.sellerUserId) return fail(gone);
  if (l.status === "reserved" && l.reservedBy !== userId && l.reservedUntil && l.reservedUntil > new Date()) return fail(gone);
  // comprou para outra pessoa: vai por e-mail, como na compra normal
  const h = order.holders?.[0];
  const gift = h && !h.me && h.email ? { name: h.name, email: h.email } : null;
  const t = { code: ticketCode(), secret: randomBytes(16).toString("hex") };
  const gifts = gift ? giftRows(userId, [{ ticketId: l.ticketId, email: gift.email }]) : [];
  const steps: BatchItem<"pg">[] = [
    markPaid(order.id, pay.ref, allowed),
    ensure(sql`(select count(*) from u) = 1`, "listing", sql`
      with u as (
        update ${resaleListings} set status = 'sold', buyer_user_id = ${userId}, order_id = ${order.id}, sold_at = now()
        where id = ${l.id} and (status = 'active' or (status = 'reserved' and (reserved_by = ${userId} or reserved_until is null or reserved_until <= now())))
        returning 1
      )`),
    ensure(sql`(select count(*) from u) = 1`, "ticket", sql`
      with u as (
        update ${tickets} set holder_user_id = ${userId}, holder_name = ${order.holders?.[0]?.name ?? order.buyerName ?? null},
          code = ${t.code}, secret = ${t.secret}, order_id = ${order.id}, order_item_id = ${order.items[0]?.id ?? null},
          status = ${gift ? "transferred" : "valid"}, updated_at = now()
        where id = ${l.ticketId} and holder_user_id = ${l.sellerUserId} and status = 'valid' returning 1
      )`),
    // transferências que o vendedor tinha aberto para este ingresso deixam de valer
    db.update(ticketTransfers).set({ status: "cancelled" }).where(and(eq(ticketTransfers.ticketId, l.ticketId), eq(ticketTransfers.status, "pending"))),
  ];
  if (gifts.length) steps.push(db.insert(ticketTransfers).values(gifts));
  // rastro (D-12): vendedor → comprador, código antigo → novo, valor do anúncio (e o envio por e-mail, se for presente)
  const holderName = order.holders?.[0]?.name ?? order.buyerName ?? null;
  steps.push(trailInsert([
    { ticketId: l.ticketId, kind: "revenda_vendida", prevCode: l.ticket.code, code: t.code, fromUserId: l.sellerUserId, toUserId: userId, holderName, orderId: order.id, refId: l.id, amountCents: l.priceCents },
    ...gifts.map((g) => ({ ticketId: g.ticketId, kind: "presente" as const, code: t.code, fromUserId: userId, toEmail: g.toEmail, holderName, orderId: order.id, refId: g.id })),
  ]));
  try {
    await runBatch(steps);
  } catch (e) {
    const why = abortOf(e);
    if (!why) return unknownFailure(order.id, e);
    if (why === "order") return (await paidView(order.id)) ?? { ok: false, busy: true, error: "Confirmando o pagamento…" };
    // o ingresso mudou de dono ou de situação: o anúncio não vale mais
    if (why === "ticket") await db.update(resaleListings).set({ status: "cancelled" }).where(and(eq(resaleListings.id, l.id), ne(resaleListings.status, "sold")));
    return fail(gone);
  }
  after(async () => {
    await mailOrderConfirmed(order.id);
    for (const g of gifts) await mailTransferSent(g.id);
    await mailResaleSold(l.sellerUserId, l.event.title, l.priceCents);
  });
  return {
    ok: true, number: order.number ?? 0, totalCents: order.totalCents, method: methodOf(order), installments: order.installments, ticketCount: 1,
    firstCode: t.code, ticketQrSvg: gift ? "" : await qrSvg(t.code, t.secret), email: order.buyerEmail ?? "", sentTo: gift ? [gift] : [],
  };
}
