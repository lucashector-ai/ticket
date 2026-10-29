import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { brl, dateFull } from "@/lib/format";
import { previewRefund } from "@/lib/payments/refund";
import { cancelWindow, deadlineLabel, deadlineOpen, EVENT_RULES, hoursLabel, policyOf, policyText } from "@/lib/refund-policy";

const { tickets, refundRequests, resaleListings } = schema;

export type MeuReembolso = {
  code: string; eventTitle: string;
  policy: string; rules: string;
  transfer: string | null; resale: string | null;
  /** cancelar este ingresso agora, pela política do evento */
  cancel: { amount: string; amountCents: number; free: boolean; legal: boolean; keptFee: string | null; until: string; test: boolean } | null;
  /** por que não dá para cancelar (quando o comprador olha o próprio ingresso) */
  blocked: string | null;
  /** pedir reembolso do pedido (evento adiado ou cancelado e ainda não reembolsado) */
  request: { reason: "adiamento" | "cancelamento"; until: string | null; total: string; tickets: number } | null;
  requested: { status: string; answer: string } | null;
  cancelled: boolean;
};

/**
 * Caixa "Cancelamento e reembolso" do ingresso. Só quem comprou e ainda tem o ingresso cancela ou pede
 * reembolso (o dinheiro volta para quem pagou); quem recebeu por transferência vê o porquê.
 * Compra feita na revenda: não cancela pela política (o vendedor já recebeu), só reembolso de evento cancelado/adiado.
 */
export async function meuReembolso(ticketId: string, userId: string): Promise<MeuReembolso | null> {
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: { order: true, event: { columns: { id: true, title: true, status: true, startAt: true, cancelPolicy: true, transferEnabled: true, resaleEnabled: true, transferUntilHours: true, resaleUntilHours: true, refundRequestsUntil: true, postponedAt: true } } },
  });
  if (!t || t.holderUserId !== userId) return null;
  const e = t.event, o = t.order;
  const now = new Date();
  const policy = policyOf(e);
  const base: MeuReembolso = {
    code: t.code, eventTitle: e.title, policy: policyText(policy), rules: EVENT_RULES,
    transfer: e.transferEnabled ? (deadlineOpen(e.startAt, e.transferUntilHours, now) ? `Transferência liberada ${deadlineLabel(e.transferUntilHours)}.` : `O prazo para transferir acabou (${deadlineLabel(e.transferUntilHours)}).`) : "O produtor não permite transferir os ingressos deste evento.",
    resale: e.resaleEnabled ? (deadlineOpen(e.startAt, e.resaleUntilHours, now) ? `Revenda oficial liberada ${deadlineLabel(e.resaleUntilHours)}.` : `O prazo da revenda acabou (${deadlineLabel(e.resaleUntilHours)}).`) : null,
    cancel: null, blocked: null, request: null, requested: null, cancelled: e.status === "cancelled",
  };
  if (!o || o.userId !== userId) {
    base.blocked = "Você recebeu este ingresso de outra pessoa. Só quem comprou pode cancelar ou pedir reembolso, porque o dinheiro volta para quem pagou.";
    return base;
  }
  const live = t.status === "valid" || t.status === "used" || t.status === "transferred";
  const req = await db.query.refundRequests.findFirst({ where: eq(refundRequests.orderId, o.id), orderBy: (x, { desc }) => [desc(x.createdAt)] });
  if (req) base.requested = { status: req.status, answer: req.answer ?? "" };

  // pedir reembolso: adiado (dentro do prazo) ou cancelado e ainda não reembolsado
  const left = await db.query.tickets.findMany({ where: and(eq(tickets.orderId, o.id), inArray(tickets.status, ["valid", "used", "transferred"])), columns: { id: true } });
  if (o.status === "paid" && left.length && o.totalCents > 0 && req?.status !== "pending") {
    if (e.status === "cancelled") base.request = { reason: "cancelamento", until: null, total: brl(o.totalCents - o.refundedCents), tickets: left.length };
    // adiado: quem comprou antes do anúncio pode pedir até o fim do prazo
    else if (e.status === "published" && e.refundRequestsUntil && e.refundRequestsUntil > now && e.postponedAt && (o.paidAt ?? o.createdAt) < e.postponedAt) {
      base.request = { reason: "adiamento", until: dateFull(e.refundRequestsUntil), total: brl(o.totalCents - o.refundedCents), tickets: left.length };
    }
  }

  if (!live) return base;
  if (e.status !== "published") { base.blocked = e.status === "cancelled" ? "O evento foi cancelado: o reembolso é integral e automático." : null; return base; }
  if (t.status === "used" || t.checkedInAt) { base.blocked = "Este ingresso já entrou no evento e não pode ser cancelado."; return base; }
  if (t.status === "transferred") { base.blocked = "Este ingresso está sendo enviado para outra pessoa. Cancele o envio antes de cancelar o ingresso."; return base; }
  if (o.status !== "paid") return base;
  if (o.resaleListingId) { base.blocked = "Ingressos comprados na revenda não podem ser cancelados pela política do evento (quem vendeu já recebeu). Se não puder ir, anuncie de novo na revenda."; return base; }
  const listed = await db.query.resaleListings.findFirst({ where: and(eq(resaleListings.ticketId, t.id), inArray(resaleListings.status, ["active", "reserved"])), columns: { id: true } });
  if (listed) { base.blocked = "Este ingresso está anunciado na revenda. Tire do anúncio para poder cancelar."; return base; }

  const free = o.totalCents === 0;
  const w = free
    ? (now < e.startAt ? { allowed: true as const, legal: true, keepFee: false, until: e.startAt } : { allowed: false as const, reason: "O evento já começou." })
    : cancelWindow(policy, { paidAt: o.paidAt ?? o.createdAt, startAt: e.startAt, now });
  if (!w.allowed) { base.blocked = w.reason; return base; }
  const p = await previewRefund(o.id, [t.id], { keepFee: w.keepFee });
  if ("error" in p) { base.blocked = p.error ?? null; return base; }
  base.cancel = {
    amount: brl(p.amountCents), amountCents: p.amountCents, free, legal: w.legal, keptFee: p.keptFeeCents ? brl(p.keptFeeCents) : null,
    until: free ? "até o início do evento" : w.legal ? `até ${dateFull(w.until)}` : `até ${hoursLabel(policy.hoursBefore)} antes do evento`, test: p.test,
  };
  return base;
}
