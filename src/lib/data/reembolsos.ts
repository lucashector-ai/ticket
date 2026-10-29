import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { brl } from "@/lib/format";
import { orderRefundView } from "@/lib/payments/refund";
import { cancelProgress, type CancelProgress } from "@/lib/payments/cancel-event";
import { isTestPayment } from "@/lib/payments/stripe";
import { policyOf, type CancelPolicy } from "@/lib/refund-policy";

const { orders, tickets, orderRefunds, refundRequests } = schema;

const fmt = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d).replace(".", "");
const METHOD: Record<string, string> = { pix: "Pix", card: "Cartão", free: "Gratuito", test: "Teste" };
const KIND: Record<string, string> = {
  order: "Pedido inteiro", tickets: "Ingressos escolhidos", event: "Cancelamento do evento", request: "Pedido do comprador",
  buyer: "Cancelado pelo comprador", stripe: "Estorno externo", auto: "Automático (compra não concluída)",
};

export type OrderStatusKey = "paid" | "partial" | "refunded" | "cancelled" | "pending" | "expired";
export function orderStatusKey(o: { status: string; refundedCents: number }): OrderStatusKey {
  if (o.status === "paid") return o.refundedCents > 0 ? "partial" : "paid";
  return (["refunded", "cancelled", "pending", "expired"].includes(o.status) ? o.status : "cancelled") as OrderStatusKey;
}

export type RefundOrderRow = { id: string; number: number | null; buyer: string; email: string; status: OrderStatusKey; total: string; refunded: string; qty: number; method: string; test: boolean; at: string };

/** Busca de pedidos do evento por nome, e-mail, número do pedido ou código do ingresso (até 25). Vazio: os mais recentes. */
export async function searchEventOrders(eventId: string, q: string): Promise<RefundOrderRow[]> {
  const t = q.trim().slice(0, 80);
  const num = t.replace(/^#|^n[ºo°]?\s*/i, "");
  const like = `%${t.replace(/[%_\\]/g, "")}%`;
  const where = and(
    eq(orders.eventId, eventId), inArray(orders.status, ["paid", "refunded", "cancelled"]), sql`${orders.paidAt} is not null`,
    t ? or(
      /^\d{1,9}$/.test(num) ? eq(orders.number, Number(num)) : undefined,
      ilike(orders.buyerName, like), ilike(orders.buyerEmail, like),
      sql`exists (select 1 from ${tickets} tk where tk.order_id = ${orders.id} and (tk.code ilike ${like} or tk.holder_name ilike ${like}))`,
    ) : undefined,
  );
  const rows = await db.query.orders.findMany({ where, with: { items: { columns: { quantity: true } } }, orderBy: [desc(orders.createdAt)], limit: 25 });
  return rows.map((o) => ({
    id: o.id, number: o.number, buyer: o.buyerName ?? "Comprador", email: o.buyerEmail ?? "", status: orderStatusKey(o),
    total: o.totalCents ? brl(o.totalCents) : "Grátis", refunded: o.refundedCents ? brl(o.refundedCents) : "", qty: o.items.reduce((s, i) => s + i.quantity, 0),
    method: isTestPayment(o) ? "Teste" : METHOD[o.paymentMethod ?? ""] ?? "—", test: isTestPayment(o), at: fmt(o.paidAt ?? o.createdAt),
  }));
}

export type RefundOrderDetail = {
  id: string; number: number | null; buyer: string; email: string; phone: string; status: OrderStatusKey; method: string; installments: number;
  test: boolean; free: boolean; resale: boolean; at: string;
  money: { subtotal: number; meia: number; discount: number; fee: number; interest: number; total: number; refunded: number; remaining: number; net: number };
  absorbFee: boolean;
  tickets: { id: string; code: string; holder: string; type: string; status: string; inAt: string | null; meia: boolean; share: number | null; gifted: boolean }[];
  refunds: HistoryRow[];
  request: { id: string; reason: string; message: string } | null;
};

export async function eventOrderDetail(eventId: string, orderId: string): Promise<RefundOrderDetail | null> {
  const v = await orderRefundView(orderId);
  if (!v || v.o.eventId !== eventId) return null;
  const o = v.o;
  const [rows, req] = await Promise.all([
    db.query.orderRefunds.findMany({ where: eq(orderRefunds.orderId, o.id), orderBy: [desc(orderRefunds.createdAt)] }),
    db.query.refundRequests.findFirst({ where: and(eq(refundRequests.orderId, o.id), eq(refundRequests.status, "pending")) }),
  ]);
  return {
    id: o.id, number: o.number, buyer: o.buyerName ?? "Comprador", email: o.buyerEmail ?? "", phone: o.buyerPhone ?? "", status: orderStatusKey(o),
    method: isTestPayment(o) ? "Teste (sem cobrança)" : o.paymentMethod === "card" ? `Cartão${o.installments > 1 ? ` em ${o.installments}x` : ""}` : METHOD[o.paymentMethod ?? ""] ?? "—",
    installments: o.installments, test: isTestPayment(o), free: o.totalCents === 0, resale: !!o.resaleListingId, at: fmt(o.paidAt ?? o.createdAt),
    money: {
      subtotal: o.subtotalCents, meia: o.meiaCents, discount: o.discountCents, fee: o.feeCents, interest: o.interestCents, total: o.totalCents,
      refunded: o.refundedCents, remaining: Math.max(0, o.totalCents - o.refundedCents), net: v.net,
    },
    absorbFee: o.event.absorbFee,
    tickets: v.ts.map((t) => ({
      id: t.id, code: t.code, holder: t.holderName ?? "", type: [t.ticketType.sector, t.ticketType.name].filter(Boolean).join(" · "), status: t.status,
      inAt: t.checkedInAt ? fmt(t.checkedInAt) : null, meia: t.halfPrice, share: v.shares.get(t.id) ?? null, gifted: t.holderUserId !== o.userId,
    })),
    refunds: rows.map(historyRow(new Map([[o.id, { number: o.number, buyer: o.buyerName ?? "Comprador" }]]))),
    request: req ? { id: req.id, reason: req.reason, message: req.message ?? "" } : null,
  };
}

export type HistoryRow = {
  id: string; orderId: string; number: number | null; buyer: string; kind: string; status: "pending" | "succeeded" | "failed";
  amount: string; producer: string; fee: string; codes: string[]; reason: string; error: string; actor: string; at: string; stripeId: string; test: boolean;
  /** cancelamento de ingresso grátis (sem dinheiro) */
  free: boolean;
};
const historyRow = (orderInfo: Map<string, { number: number | null; buyer: string }>) => (r: typeof orderRefunds.$inferSelect): HistoryRow => ({
  id: r.id, orderId: r.orderId, number: orderInfo.get(r.orderId)?.number ?? null, buyer: orderInfo.get(r.orderId)?.buyer ?? "Comprador",
  kind: KIND[r.kind] ?? r.kind, status: (["pending", "succeeded", "failed"].includes(r.status) ? r.status : "failed") as HistoryRow["status"],
  amount: brl(r.amountCents), producer: brl(r.producerCents), fee: brl(r.feeCents), codes: r.ticketCodes ?? [], reason: r.reason ?? "", error: r.error ?? "",
  actor: r.actorName ?? "—", at: fmt(r.createdAt), stripeId: r.stripeRefundId ?? "", test: r.test, free: r.amountCents === 0 && r.kind !== "stripe",
});

export type RequestRow = { id: string; orderId: string; number: number | null; buyer: string; email: string; reason: string; message: string; at: string; total: string; inWindow: boolean };

export type RefundTab = {
  eventId: string; title: string; status: string; cancelled: boolean; cancelledAt: string | null; cancelReason: string;
  postponed: { at: string; from: string; until: string; open: boolean } | null;
  startLocal: string; startLabel: string; started: boolean;
  policy: CancelPolicy; absorbFee: boolean;
  progress: CancelProgress | null;
  kpis: { refunded: string; orders: number; producer: string; pending: number };
  requests: RequestRow[];
  history: HistoryRow[];
  recent: RefundOrderRow[];
};

/** Dados da aba "Cancelamentos e reembolsos". */
export async function refundTabData(e: { id: string; title: string; status: string; startAt: Date; absorbFee: boolean; cancelPolicy: CancelPolicy | null; cancelledAt: Date | null; cancelReason: string | null; postponedAt: Date | null; postponedFrom: Date | null; refundRequestsUntil: Date | null }, startLocal: string, startLabel: string, now: number): Promise<RefundTab> {
  const [rows, reqs, recent, progress] = await Promise.all([
    db.query.orderRefunds.findMany({ where: eq(orderRefunds.eventId, e.id), orderBy: [desc(orderRefunds.createdAt)], limit: 200 }),
    db.query.refundRequests.findMany({ where: and(eq(refundRequests.eventId, e.id), eq(refundRequests.status, "pending")), with: { order: true }, orderBy: [desc(refundRequests.createdAt)], limit: 200 }),
    searchEventOrders(e.id, ""),
    e.status === "cancelled" ? cancelProgress(e.id) : Promise.resolve(null),
  ]);
  const ids = [...new Set(rows.map((r) => r.orderId))];
  const info = ids.length ? await db.query.orders.findMany({ where: inArray(orders.id, ids), columns: { id: true, number: true, buyerName: true } }) : [];
  const map = new Map(info.map((o) => [o.id, { number: o.number, buyer: o.buyerName ?? "Comprador" }]));
  const ok = rows.filter((r) => r.status !== "failed");
  const until = e.refundRequestsUntil;
  return {
    eventId: e.id, title: e.title, status: e.status, cancelled: e.status === "cancelled", cancelledAt: e.cancelledAt ? fmt(e.cancelledAt) : null, cancelReason: e.cancelReason ?? "",
    postponed: e.postponedAt && e.postponedFrom ? { at: fmt(e.postponedAt), from: fmt(e.postponedFrom), until: until ? fmt(until) : "", open: !!until && until.getTime() > now } : null,
    startLocal, startLabel, started: e.startAt.getTime() <= now,
    policy: policyOf(e), absorbFee: e.absorbFee,
    progress,
    kpis: {
      refunded: brl(ok.filter((r) => !r.test).reduce((s, r) => s + r.amountCents, 0)), orders: new Set(ok.map((r) => r.orderId)).size,
      producer: brl(ok.filter((r) => !r.test).reduce((s, r) => s + r.producerCents, 0)), pending: reqs.length,
    },
    requests: reqs.map((r) => ({
      id: r.id, orderId: r.orderId, number: r.order.number, buyer: r.order.buyerName ?? "Comprador", email: r.order.buyerEmail ?? "",
      reason: r.reason === "adiamento" ? "Evento adiado" : "Evento cancelado", message: r.message ?? "", at: fmt(r.createdAt), total: brl(r.order.totalCents),
      inWindow: r.reason === "adiamento" && !!until && r.createdAt.getTime() <= until.getTime(),
    })),
    history: rows.map(historyRow(map)),
    recent,
  };
}
