import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { and, asc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db, schema } from "@/db";
import { mailOrderRefunded } from "@/lib/notify";
import { platformFee, ticketRevenue } from "@/lib/data/painel";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { isTestPayment, stripe, stripeEnabled } from "@/lib/payments/stripe";
import { mailTicketsRefunded } from "@/lib/refund-mail";
import { abortOf, ensure, runBatch } from "@/lib/payments/tx";

const { orders, tickets, ticketTypes, resaleListings, ticketTransfers, orderRefunds } = schema;

/*
 * Reembolsos: uma rotina só para o produtor (pedido inteiro ou ingressos escolhidos), o comprador (política
 * do evento), o cancelamento do evento e os pedidos de reembolso.
 *
 * Dinheiro (centavos):
 *  - cada ingresso tem uma parte fixa do que foi pago no pedido, proporcional ao preço dele depois da meia
 *    (o cupom e os juros do parcelamento se dividem na mesma proporção). A taxa de serviço vai junto, na
 *    mesma proporção, exceto quando o comprador cancela fora dos 7 dias e o evento fica com a taxa (keepFee);
 *  - o último reembolso do pedido devolve exatamente o que falta (sem sobra de arredondamento);
 *  - do saldo do produtor sai a parte líquida que ele recebeu por esses ingressos (producer_cents): o valor
 *    do ingresso menos a taxa, se ele absorvia a taxa. A taxa de serviço devolvida é da Tickets Win.
 *
 * Segurança contra clique duplo / duas abas / cron + painel juntos: a linha de order_refunds nasce "pending"
 * com idem_key único por pedido + ingressos antes de chamar a Stripe; quem não consegue criar/retomar a
 * linha recebe "busy". A Stripe recebe uma chave de idempotência por linha, e numa nova tentativa
 * procuramos antes um estorno já criado para a linha (metadata.refundRowId).
 */

export const REFUNDABLE = ["valid", "used", "transferred"] as const;
const STALE_MS = 2 * 60_000;

export type RefundKind = "order" | "tickets" | "event" | "request" | "buyer" | "stripe" | "auto";
export type Actor = { userId: string | null; name: string | null };

type OrderRow = typeof orders.$inferSelect;
type Loaded = Awaited<ReturnType<typeof loadOrder>>;

async function loadOrder(orderId: string) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true, event: { columns: { id: true, absorbFee: true, title: true, slug: true, startAt: true, status: true } } } });
  if (!o) return null;
  const [ts, rows] = await Promise.all([
    db.query.tickets.findMany({ where: eq(tickets.orderId, o.id), with: { ticketType: { columns: { priceCents: true, name: true, sector: true } } }, orderBy: [asc(tickets.code)] }),
    db.query.orderRefunds.findMany({ where: and(eq(orderRefunds.orderId, o.id), inArray(orderRefunds.status, ["pending", "succeeded"])) }),
  ]);
  return { o, ts, rows };
}

/** Líquido do produtor no pedido (o que entrou no saldo dele). Compra na revenda não entra no saldo do produtor. */
export function producerNet(o: Pick<OrderRow, "subtotalCents" | "meiaCents" | "discountCents" | "resaleListingId">, absorb: boolean) {
  if (o.resaleListingId) return 0;
  const rev = ticketRevenue(o);
  return rev - platformFee(rev, absorb);
}

export type RefundPlan = {
  amountCents: number; feeCents: number; producerCents: number; keptFeeCents: number;
  ticketIds: string[]; codes: string[]; checkedIn: number;
  /** depois deste reembolso o pedido fica sem nada a devolver */
  full: boolean; free: boolean; test: boolean; resale: boolean;
  remainingCents: number;
};

/** Quanto volta, quanto sai do saldo do produtor e quais ingressos deixam de valer. */
export function planRefund(L: NonNullable<Loaded>, sel: string[] | "all", opts: { keepFee?: boolean } = {}): RefundPlan | { error: string } {
  const { o, ts, rows } = L;
  const refundable = ts.filter((t) => (REFUNDABLE as readonly string[]).includes(t.status));
  let target = refundable;
  if (sel !== "all") {
    const want = new Set(sel);
    target = refundable.filter((t) => want.has(t.id));
    if (target.length !== want.size) return { error: "Algum ingresso escolhido já foi reembolsado, cancelado ou não é deste pedido." };
  }
  // taxa que ficou retida num cancelamento anterior não volta depois
  const keptDone = rows.reduce((s, r) => s + r.keptFeeCents, 0);
  const remaining = Math.max(0, o.totalCents - o.refundedCents - keptDone);
  const units = o.items.reduce((s, i) => s + i.quantity, 0);
  // pedido sem ingresso nenhum (nem item): só o valor pago; ingresso revendido saiu do pedido e não conta aqui
  if (!target.length && !(sel === "all" && !ts.length && !units && remaining > 0)) return { error: "Não há nada para reembolsar neste pedido." };

  const priceOf = (typeId: string) => o.items.find((i) => i.ticketTypeId === typeId)?.unitPriceCents ?? 0;
  const weight = (t: (typeof ts)[number]) => { const p = priceOf(t.ticketTypeId); return p - (o.meiaCents > 0 && t.halfPrice ? Math.round(p / 2) : 0); };
  // unidades que saíram do pedido (ingresso revendido passa para o pedido de quem comprou na revenda)
  const missing = o.items.reduce((s, i) => s + Math.max(0, i.quantity - ts.filter((t) => t.ticketTypeId === i.ticketTypeId).length) * i.unitPriceCents, 0);
  const W = ts.reduce((s, t) => s + weight(t), 0) + missing;
  const share = (base: number) => target.reduce((s, t) => s + (W > 0 ? Math.round((base * weight(t)) / W) : 0), 0);

  const absorb = o.event.absorbFee;
  const net = producerNet(o, absorb);
  const producerDone = rows.reduce((s, r) => s + r.producerCents, 0);
  const feeDone = rows.reduce((s, r) => s + r.feeCents, 0);
  const full = refundable.length === target.length && ts.length === units;

  let amount = full ? remaining : Math.min(remaining, share(o.totalCents));
  const feeLeft = Math.max(0, o.feeCents - feeDone - keptDone);
  const feePart = full ? feeLeft : Math.min(share(o.feeCents), feeLeft);
  const keptFee = opts.keepFee ? Math.min(feePart, amount) : 0;
  amount -= keptFee;
  // revenda: o produtor devolve o valor original do ingresso (o que entrou para ele na primeira venda)
  const faceNet = (t: (typeof ts)[number]) => {
    const face = t.ticketType.priceCents - (t.halfPrice ? Math.round(t.ticketType.priceCents / 2) : 0);
    return absorb ? Math.round(face * (1 - SERVICE_FEE_RATE)) : face;
  };
  const producer = o.resaleListingId
    ? Math.min(amount, target.reduce((s, t) => s + faceNet(t), 0))
    : full ? Math.max(0, net - producerDone) : Math.min(Math.max(0, net - producerDone), share(net));

  return {
    amountCents: Math.max(0, amount), feeCents: feePart - keptFee, producerCents: producer, keptFeeCents: keptFee,
    ticketIds: target.map((t) => t.id), codes: target.map((t) => t.code), checkedIn: target.filter((t) => t.status === "used" || !!t.checkedInAt).length,
    full, free: o.totalCents === 0, test: isTestPayment(o), resale: !!o.resaleListingId, remainingCents: remaining,
  };
}

export async function previewRefund(orderId: string, sel: string[] | "all", opts: { keepFee?: boolean } = {}) {
  const L = await loadOrder(orderId);
  if (!L) return { error: "Pedido não encontrado." } as const;
  return planRefund(L, sel, opts);
}

/** Erros da Stripe no estorno, em português para o painel. */
export function refundErrorMessage(e: unknown): string {
  const err = e as { type?: string; code?: string; message?: string };
  const map: Record<string, string> = {
    amount_too_large: "O valor passa do que ainda pode ser estornado nesta cobrança. Ela pode já ter sido estornada.",
    charge_disputed: "Este pagamento está em contestação (chargeback) no banco do comprador. O estorno não pode ser feito agora.",
    balance_insufficient: "Não foi possível estornar agora por falta de saldo na conta de pagamentos. Tente de novo mais tarde ou fale com a Tickets Win.",
    insufficient_funds: "Não foi possível estornar agora por falta de saldo na conta de pagamentos. Tente de novo mais tarde ou fale com a Tickets Win.",
    charge_expired_for_refund: "O prazo para estornar este pagamento acabou. Será preciso devolver por Pix manualmente: fale com a Tickets Win.",
    refund_disputed_payment: "Este pagamento está em contestação (chargeback): o estorno não pode ser feito agora. Fale com a Tickets Win.",
    resource_missing: "A cobrança deste pedido não foi encontrada. Fale com a Tickets Win.",
    rate_limit: "Muitas solicitações seguidas. Aguarde alguns segundos e tente de novo.",
  };
  if (err?.code && map[err.code]) return map[err.code];
  if (err?.type === "StripeConnectionError" || err?.type === "StripeAPIError") return "Não conseguimos processar o estorno agora. Tente de novo em instantes: nada foi estornado.";
  if (err?.type === "StripeRateLimitError") return map.rate_limit;
  return `O estorno não foi aceito${err?.code ? ` (${err.code})` : ""}. Tente de novo ou fale com a Tickets Win.`;
}

export type RefundInput = {
  orderId: string;
  /** "all" = tudo o que ainda dá para reembolsar no pedido */
  ticketIds: string[] | "all";
  kind: RefundKind;
  actor: Actor;
  /** recado para quem pagou (vai no e-mail) */
  note?: string | null;
  /** aceita ingressos que já passaram na portaria */
  allowCheckedIn?: boolean;
  keepFee?: boolean;
  /** e-mail para quem pagou: o padrão de reembolso, o do evento cancelado (enviado por quem chamou) ou nenhum */
  mail?: "refund" | "none";
  /** confere que o pedido é deste evento */
  eventId?: string;
};
export type RefundOutcome =
  | { ok: true; amountCents: number; producerCents: number; feeCents: number; tickets: number; test: boolean; free: boolean; already?: boolean }
  | { ok: false; error: string; code?: "checked_in" | "busy" | "stripe" | "invalid" };

const idemKey = (orderId: string, ids: string[], refunded: number) =>
  ids.length ? `t:${orderId}:${createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 40)}` : `r:${orderId}:${refunded}`;

/** Reembolsa (ou cancela, se grátis) ingressos de um pedido. Idempotente; pode ser chamada de novo depois de uma falha. */
export async function refundTickets(inp: RefundInput): Promise<RefundOutcome> {
  const L = await loadOrder(inp.orderId);
  if (!L || (inp.eventId && L.o.eventId !== inp.eventId)) return { ok: false, code: "invalid", error: "Pedido não encontrado." };
  const o = L.o;
  if (o.status === "refunded") return { ok: true, already: true, amountCents: 0, producerCents: 0, feeCents: 0, tickets: 0, test: isTestPayment(o), free: o.totalCents === 0 };
  if (o.status !== "paid") return { ok: false, code: "invalid", error: "Este pedido não foi pago." };
  const first = planRefund(L, inp.ticketIds, { keepFee: inp.keepFee });
  if ("error" in first) return { ok: false, code: "invalid", error: first.error };
  let plan: RefundPlan = first;
  if (plan.checkedIn && !inp.allowCheckedIn) {
    return { ok: false, code: "checked_in", error: plan.checkedIn === 1 ? "1 ingresso já entrou no evento. Confirme para reembolsar mesmo assim." : `${plan.checkedIn} ingressos já entraram no evento. Confirme para reembolsar mesmo assim.` };
  }

  const key = idemKey(o.id, plan.ticketIds, o.refundedCents);
  const values = {
    orderId: o.id, eventId: o.eventId, idemKey: key, kind: inp.kind, status: "pending", amountCents: plan.amountCents, feeCents: plan.feeCents, keptFeeCents: plan.keptFeeCents,
    producerCents: plan.producerCents, ticketIds: plan.ticketIds, ticketCodes: plan.codes, reason: inp.note?.trim() || null, test: plan.test,
    actorUserId: inp.actor.userId, actorName: inp.actor.name?.slice(0, 160) ?? null,
  };
  let rowId: string;
  let retry = false;
  const [ins] = await db.insert(orderRefunds).values(values).onConflictDoNothing().returning({ id: orderRefunds.id });
  if (ins) rowId = ins.id;
  else {
    const ex = await db.query.orderRefunds.findFirst({ where: eq(orderRefunds.idemKey, key) });
    if (ex?.status === "succeeded") return { ok: true, already: true, amountCents: ex.amountCents, producerCents: ex.producerCents, feeCents: ex.feeCents, tickets: ex.ticketIds?.length ?? 0, test: ex.test, free: plan.free };
    // (outro reembolso do mesmo pedido em andamento: o índice de "um pendente por pedido" recusa, e vira "busy")
    const [re] = ex ? await db.update(orderRefunds)
      .set({ ...values, attempts: sql`${orderRefunds.attempts} + 1`, error: null })
      .where(and(eq(orderRefunds.id, ex.id), or(eq(orderRefunds.status, "failed"), lt(orderRefunds.updatedAt, new Date(Date.now() - STALE_MS)))))
      .returning({ id: orderRefunds.id }).catch(() => []) : [];
    if (!re) return { ok: false, code: "busy", error: "Este reembolso já está sendo processado. Atualize em alguns segundos." };
    rowId = re.id;
    retry = true;
  }

  // com a linha "pending" (um reembolso por pedido de cada vez, pelo índice único), calcula de novo sem contar a própria
  // linha: outro reembolso do mesmo pedido pode ter terminado entre o cálculo acima e a trava (sem isso, os dois
  // chegavam à Stripe), e numa retomada a linha antiga não pode descontar dela mesma
  const fresh = await loadOrder(o.id);
  const again = fresh?.o.status === "paid" ? planRefund({ ...fresh, rows: fresh.rows.filter((r) => r.id !== rowId) }, inp.ticketIds, { keepFee: inp.keepFee }) : null;
  if (!again || "error" in again || again.ticketIds.join() !== plan.ticketIds.join()) {
    const error = "Este pedido mudou enquanto o reembolso era feito (outro reembolso terminou antes). Atualize a página e confira.";
    await db.update(orderRefunds).set({ status: "failed", error }).where(eq(orderRefunds.id, rowId));
    return { ok: false, code: "invalid", error };
  }
  if (again.amountCents !== plan.amountCents || again.feeCents !== plan.feeCents || again.producerCents !== plan.producerCents || again.keptFeeCents !== plan.keptFeeCents) {
    await db.update(orderRefunds).set({ amountCents: again.amountCents, feeCents: again.feeCents, producerCents: again.producerCents, keptFeeCents: again.keptFeeCents }).where(eq(orderRefunds.id, rowId));
  }
  plan = again;

  let stripeRefundId: string | null = null;
  if (!plan.test && plan.amountCents > 0) {
    const pi = o.stripePaymentIntentId ?? (o.paymentRef?.startsWith("STRIPE-") ? o.paymentRef.slice(7) : null);
    const failRow = async (error: string, code: "stripe" | "invalid" = "stripe"): Promise<RefundOutcome> => {
      await db.update(orderRefunds).set({ status: "failed", error }).where(eq(orderRefunds.id, rowId));
      return { ok: false, code, error };
    };
    if (!pi) return failRow("Este pedido não tem a cobrança registrada. Fale com a Tickets Win para estornar.", "invalid");
    if (!stripeEnabled()) return failRow("Os pagamentos não estão configurados neste ambiente: nada foi estornado.", "invalid");
    try {
      const s = stripe();
      const prev = retry ? (await s.refunds.list({ payment_intent: pi, limit: 100 })).data.find((r) => r.metadata?.refundRowId === rowId && r.status !== "failed" && r.status !== "canceled") : undefined;
      const r = prev ?? await s.refunds.create(
        {
          payment_intent: pi, amount: plan.amountCents, reason: "requested_by_customer",
          metadata: { orderId: o.id, orderNumber: String(o.number ?? ""), refundRowId: rowId, kind: inp.kind, source: "tickets-win" },
        },
        { idempotencyKey: `twrf-${rowId}-${plan.amountCents}` },
      );
      stripeRefundId = r.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.error("stripe refund", o.id, err.code, err.message);
      // já estornado direto na Stripe: segue para marcar aqui
      if (err.code !== "charge_already_refunded") return failRow(refundErrorMessage(e));
    }
  }

  try {
    await applyRefund(L, plan, rowId, stripeRefundId);
  } catch (e) {
    // nada foi gravado (a transação vale inteira ou nada): a linha segue "pending" e é retomada depois de
    // STALE_MS; o estorno já feito é achado pela linha (metadata.refundRowId) e não sai duas vezes
    console.error("refund apply", o.id, e);
    return { ok: false, code: "busy", error: "Não conseguimos concluir o reembolso agora. Tente de novo em alguns minutos: nada será devolvido duas vezes." };
  }
  if (inp.mail !== "none") {
    const note = inp.note?.trim() || null;
    after(() => mailTicketsRefunded(o.id, { amountCents: plan.amountCents, codes: plan.codes, note, kind: inp.kind, keptFeeCents: plan.keptFeeCents, free: plan.free }));
  }
  return { ok: true, amountCents: plan.amountCents, producerCents: plan.producerCents, feeCents: plan.feeCents, tickets: plan.ticketIds.length, test: plan.test, free: plan.free };
}

const uuidArray = (ids: string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
const REFUNDABLE_SQL = sql.join(REFUNDABLE.map((x) => sql`${x}`), sql`, `);

/**
 * Ingressos que deixam de valer, transferências e anúncios de revenda deles cancelados e lugares de volta para a
 * venda, num comando só. Ingresso comprado na revenda não devolve o lugar (ele já tinha sido vendido antes).
 */
const releaseTickets = (where: SQL, status: "refunded" | "cancelled", resale: boolean) => db.execute(sql`
  with gone as (update ${tickets} set status = ${status} where ${where} returning id, ticket_type_id),
  tr as (update ${ticketTransfers} set status = 'cancelled' where ticket_id in (select id from gone) and status = 'pending' returning 1),
  rl as (update ${resaleListings} set status = 'cancelled' where ticket_id in (select id from gone) and status in ('active', 'reserved') returning 1),
  per as (select ticket_type_id, count(*)::int n from gone where not ${resale}::boolean group by ticket_type_id),
  seats as (update ${ticketTypes} tt set sold = greatest(tt.sold - per.n, 0) from per where tt.id = per.ticket_type_id returning 1)
  select (select count(*) from gone)::int as n`);

/**
 * Efeitos do reembolso concluído, numa transação só: a linha do reembolso vira "succeeded" (uma vez só: repetir não
 * devolve o lugar duas vezes), ingressos deixam de valer, lugares voltam, o pedido soma o que já voltou e, sem nada
 * mais a devolver, vira reembolsado. Uma queda no meio não deixa ingresso cancelado com o lugar preso nem a linha
 * "pending" para sempre: ou tudo vale, ou nada (a linha volta a ser retomada depois de STALE_MS).
 * Devolve false se outra tentativa já tinha concluído esta linha.
 */
async function applyRefund(L: NonNullable<Loaded>, plan: RefundPlan, rowId: string, stripeRefundId: string | null): Promise<boolean> {
  const { o } = L;
  const ids = plan.ticketIds;
  const close = plan.free ? "cancelled" : "refunded";
  const steps: BatchItem<"pg">[] = [
    ensure(sql`(select count(*) from u) = 1`, "refund_row", sql`with u as (
      update ${orderRefunds} set status = 'succeeded', stripe_refund_id = ${stripeRefundId}, error = null, updated_at = now()
      where id = ${rowId} and status = 'pending' returning 1)`),
  ];
  // os ingressos do cálculo continuam reembolsáveis (senão a linha não conclui e é conferida de novo na retomada)
  if (ids.length) steps.push(ensure(sql`(select count(*) from ${tickets} where id = any(${uuidArray(ids)}) and status in (${REFUNDABLE_SQL})) = ${ids.length}`, "refund_changed"));
  if (ids.length) steps.push(releaseTickets(sql`id = any(${uuidArray(ids)}) and status in (${REFUNDABLE_SQL})`, plan.free ? "cancelled" : "refunded", !!o.resaleListingId));
  // refunded_cents = soma dos reembolsos concluídos; sem ingresso válido e sem nada a devolver, o pedido fecha
  steps.push(db.execute(sql`
    update ${orders} set
      refunded_cents = (select coalesce(sum(amount_cents), 0)::int from ${orderRefunds} where order_id = ${o.id} and status = 'succeeded'),
      status = case when ${plan.full}::boolean and not exists (select 1 from ${tickets} where order_id = ${o.id} and status in (${REFUNDABLE_SQL}))
        then ${close} else status end,
      updated_at = now()
    where id = ${o.id} and status = 'paid'`));
  try {
    await runBatch(steps);
    return true;
  } catch (e) {
    if (abortOf(e) === "refund_row") return false;
    throw e;
  }
}

export type RefundResult = { ok: true; refundedCents: number; full: boolean; stripeRefundId: string | null } | { ok: false; error: string };

/**
 * Estorno automático de um pedido cobrado que não pôde ser concluído (emissão falhou) ou reembolso total
 * de um pedido pago. Pedido pago: passa pela rotina completa (refundTickets). Pedido ainda não emitido:
 * estorna o total na Stripe e registra na trilha (sem mexer no saldo do produtor, que nunca recebeu).
 * `email`: texto do e-mail para quem pagou (sem ele, não manda e-mail).
 */
export async function refundOrder(orderId: string, opts: { amountCents?: number; email?: string; reason?: "requested_by_customer" | "duplicate" | "fraudulent" } = {}): Promise<RefundResult> {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o) return { ok: false, error: "Pedido não encontrado." };
  if (o.status === "refunded") return { ok: true, refundedCents: 0, full: true, stripeRefundId: null };
  if (o.status === "paid") {
    const r = await refundTickets({ orderId, ticketIds: "all", kind: "order", actor: { userId: null, name: "Tickets Win" }, note: opts.email ?? null, allowCheckedIn: true, mail: opts.email ? "refund" : "none" });
    return r.ok ? { ok: true, refundedCents: r.amountCents, full: true, stripeRefundId: null } : { ok: false, error: r.error };
  }
  const amount = Math.min(opts.amountCents ?? o.totalCents, o.totalCents);
  if (amount <= 0 && o.totalCents > 0) return { ok: false, error: "Valor de reembolso inválido." };
  const full = amount >= o.totalCents;
  const key = `a:${o.id}:${full ? "full" : amount}`;
  await db.insert(orderRefunds).values({ orderId: o.id, eventId: o.eventId, idemKey: key, kind: "auto", amountCents: amount, test: isTestPayment(o), actorName: "Tickets Win (automático)", reason: opts.email ?? null }).onConflictDoNothing();
  const row = await db.query.orderRefunds.findFirst({ where: eq(orderRefunds.idemKey, key), columns: { id: true } });
  let refundId: string | null = null;
  if (o.stripePaymentIntentId && !isTestPayment(o) && o.totalCents > 0) {
    if (!stripeEnabled()) return { ok: false, error: "Os pagamentos não estão configurados: fale com a Tickets Win para reembolsar." };
    try {
      const r = await stripe().refunds.create(
        {
          payment_intent: o.stripePaymentIntentId,
          ...(full ? {} : { amount }),
          reason: opts.reason ?? "requested_by_customer",
          metadata: { orderId: o.id, orderNumber: String(o.number ?? ""), refundRowId: row?.id ?? "", kind: "auto", source: "tickets-win" },
        },
        { idempotencyKey: `refund-${o.id}-${full ? "full" : amount}` },
      );
      refundId = r.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // já estornado (pelo painel da Stripe ou por uma chamada anterior): segue para marcar aqui
      if (err.code !== "charge_already_refunded") {
        console.error("stripe refund", o.id, err.message);
        if (row) await db.update(orderRefunds).set({ status: "failed", error: refundErrorMessage(e) }).where(eq(orderRefunds.id, row.id));
        return { ok: false, error: "Não foi possível estornar agora. Tente de novo ou fale com a Tickets Win." };
      }
    }
  }
  if (row) await db.update(orderRefunds).set({ status: "succeeded", stripeRefundId: refundId, error: null }).where(eq(orderRefunds.id, row.id));
  if (full) await markOrderRefunded(o.id);
  await db.update(orders).set({ refundedCents: amount }).where(eq(orders.id, o.id));
  if (opts.email) {
    const text = opts.email;
    after(() => mailOrderRefunded(o.id, text, amount));
  }
  return { ok: true, refundedCents: amount, full, stripeRefundId: refundId };
}

/**
 * Marca o pedido como reembolsado (idempotente). Ingressos válidos ou em transferência viram "refunded"
 * (o QR deixa de valer e o envio pendente é cancelado), anúncios de revenda deles saem do ar e os lugares
 * voltam para a venda.
 */
export async function markOrderRefunded(orderId: string) {
  // um comando só: o pedido vira reembolsado junto com os ingressos e os lugares (antes, uma queda depois do
  // primeiro passo deixava o pedido reembolsado com ingressos válidos, e a nova tentativa parava logo no começo)
  const r = await db.execute<{ flipped: number }>(sql`
    with o as (update ${orders} set status = 'refunded', updated_at = now() where id = ${orderId} and status <> 'refunded' returning id, resale_listing_id),
    gone as (update ${tickets} t set status = 'refunded' from o where t.order_id = o.id and t.status in ('valid', 'transferred') returning t.id, t.ticket_type_id),
    tr as (update ${ticketTransfers} set status = 'cancelled' where ticket_id in (select id from gone) and status = 'pending' returning 1),
    rl as (update ${resaleListings} set status = 'cancelled' where ticket_id in (select id from gone) and status in ('active', 'reserved') returning 1),
    per as (select ticket_type_id, count(*)::int n from gone where not exists (select 1 from o where resale_listing_id is not null) group by ticket_type_id),
    seats as (update ${ticketTypes} tt set sold = greatest(tt.sold - per.n, 0) from per where tt.id = per.ticket_type_id returning 1)
    select (select count(*) from o)::int as flipped`);
  return (r.rows[0]?.flipped ?? 0) > 0;
}

/**
 * Webhook charge.refunded: o que a Stripe diz que já foi estornado e ainda não está na nossa trilha (estorno
 * feito direto no painel da Stripe) vira uma linha "stripe". Os nossos estornos já têm linha (criada antes da
 * chamada), então não são processados duas vezes. Estorno total: o pedido vira reembolsado.
 */
export async function syncStripeRefund(orderId: string, ch: { id: string; amountRefunded: number; fully: boolean }) {
  const L = await loadOrder(orderId);
  if (!L) return;
  const { o } = L;
  const [s] = await db.select({ sum: sql<number>`coalesce(sum(${orderRefunds.amountCents}), 0)::int`, prod: sql<number>`coalesce(sum(${orderRefunds.producerCents}), 0)::int` })
    .from(orderRefunds).where(and(eq(orderRefunds.orderId, o.id), inArray(orderRefunds.status, ["pending", "succeeded"])));
  const diff = ch.amountRefunded - (s?.sum ?? 0);
  if (diff > 0) {
    // só pedidos que chegaram a ser pagos entram no saldo do produtor
    const net = o.status === "paid" || o.status === "refunded" ? producerNet(o, o.event.absorbFee) : 0;
    const prod = ch.fully ? Math.max(0, net - (s?.prod ?? 0)) : Math.min(Math.max(0, net - (s?.prod ?? 0)), o.totalCents ? Math.round((net * diff) / o.totalCents) : 0);
    await db.insert(orderRefunds).values({
      orderId: o.id, eventId: o.eventId, idemKey: `s:${ch.id}:${ch.amountRefunded}`, kind: "stripe", status: "succeeded", amountCents: diff, producerCents: prod,
      actorName: "Tickets Win (estorno externo)", reason: "Estorno feito fora do painel do produtor.",
    }).onConflictDoNothing();
  }
  if (ch.fully) await markOrderRefunded(o.id);
  const [t] = await db.select({ sum: sql<number>`coalesce(sum(${orderRefunds.amountCents}), 0)::int` }).from(orderRefunds)
    .where(and(eq(orderRefunds.orderId, o.id), eq(orderRefunds.status, "succeeded")));
  await db.update(orders).set({ refundedCents: t?.sum ?? 0 }).where(eq(orders.id, o.id));
}

/** Pedido com o valor de cada ingresso (o que volta se só ele for reembolsado), para o painel. */
export async function orderRefundView(orderId: string) {
  const L = await loadOrder(orderId);
  if (!L) return null;
  const shares = new Map<string, number>();
  for (const t of L.ts) {
    if (!(REFUNDABLE as readonly string[]).includes(t.status)) continue;
    const p = planRefund(L, [t.id]);
    if (!("error" in p)) shares.set(t.id, p.amountCents);
  }
  return { ...L, shares, net: producerNet(L.o, L.o.event.absorbFee) };
}
