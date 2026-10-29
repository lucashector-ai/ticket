import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { brl, dateFull, dateTimeShort, hourLabel } from "@/lib/format";
import { isTestPayment } from "@/lib/payments/stripe";
import { METHOD_LABEL, maskCpfHidden, orderPill, type OrderPill } from "@/lib/pedido";
import { formatPhone } from "@/lib/phone";
import { EVENT_RULES, policyOf, policyText } from "@/lib/refund-policy";
import { meuReembolso, planMyCancel } from "@/lib/data/meu-reembolso";
import { eventLabels } from "@/lib/tickets/labels";

/*
 * Detalhes do pedido em Minha conta → Minhas compras. Só o dono do pedido (orders.user_id) vê; para os outros
 * a página dá 404. Cancelamento e pedido de reembolso usam as mesmas regras da caixa do ingresso (meuReembolso).
 */

const { orders, ticketTransfers, orderRefunds, refundRequests, resaleListings } = schema;

const REFUND_KIND: Record<string, string> = {
  buyer: "Você cancelou",
  order: "Reembolso feito pelo produtor",
  tickets: "Reembolso feito pelo produtor",
  event: "Reembolso pelo cancelamento do evento",
  request: "Pedido de reembolso aprovado",
  stripe: "Estorno feito pela Tickets Win",
  auto: "Estorno automático",
};

export type TimelineItem = { at: Date; when: string; title: string; text?: string; tone?: "ok" | "warn" | "bad" | "azul" };
export type TicketRow = {
  id: string; code: string; holder: string; tier: string; half: boolean;
  status: string; tone: "ok" | "warn" | "bad" | "azul" | "";
  /** quem ainda tem o ingresso na conta (abre /ingressos/<código>) */
  mine: boolean;
  /** envio pendente: dá para reenviar ou cancelar */
  pending: { transferId: string; ticketId: string; email: string; gift: boolean } | null;
};
export type PriceLine = { label: string; sub: string; qty: number; unitCents: number; totalCents: number };
export type CancelView = {
  policy: string; rules: string; eventCancelled: boolean;
  /** pode cancelar agora */
  can: null | {
    tickets: { code: string; label: string }[];
    allCents: number; allKeptFeeCents: number; full: boolean; free: boolean; test: boolean; legal: boolean; until: string;
  };
  /** pedir reembolso (adiado / cancelado e não reembolsado): usa um ingresso do pedido que ainda está com o comprador */
  request: null | { code: string; reason: "adiamento" | "cancelamento"; until: string | null; total: string; tickets: number };
  requested: { status: string; answer: string } | null;
  /** por que não dá para cancelar */
  blocked: string | null;
  /** dá para cancelar alguns: por que os outros ingressos do pedido ficam de fora */
  others: string | null;
};

const H = 3_600_000;

export async function orderDetail(orderId: string, userId: string) {
  const o = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    with: {
      event: {
        columns: {
          id: true, slug: true, title: true, flyerId: true, status: true, startAt: true, endAt: true, dateLabel: true, dateFullLabel: true, doorsLabel: true,
          venueNameOverride: true, addressLabel: true, cancelPolicy: true, cancelledAt: true, cancelReason: true, postponedAt: true, postponedFrom: true, absorbFee: true,
        },
        with: { venue: { with: { city: true } } },
      },
      items: { with: { ticketType: { columns: { name: true, sector: true, kind: true }, with: { session: { columns: { startAt: true } } } } } },
      coupon: { columns: { code: true } },
      tickets: { with: { ticketType: { columns: { name: true, sector: true } } }, orderBy: (t) => [asc(t.code)] },
    },
  });
  if (!o) return null;
  const now = new Date();
  const e = o.event;
  const ids = o.tickets.map((t) => t.id);
  const [transfers, refunds, requests, listed] = await Promise.all([
    ids.length ? db.query.ticketTransfers.findMany({ where: inArray(ticketTransfers.ticketId, ids), orderBy: (t) => [asc(t.createdAt)] }) : Promise.resolve([]),
    db.query.orderRefunds.findMany({ where: and(eq(orderRefunds.orderId, o.id), inArray(orderRefunds.status, ["pending", "succeeded"])), orderBy: (t) => [asc(t.createdAt)] }),
    db.query.refundRequests.findMany({ where: eq(refundRequests.orderId, o.id), orderBy: (t) => [asc(t.createdAt)] }),
    ids.length ? db.query.resaleListings.findMany({ where: and(inArray(resaleListings.ticketId, ids), inArray(resaleListings.status, ["active", "reserved"])), columns: { ticketId: true } }) : Promise.resolve([]),
  ]);
  const L = eventLabels(e);
  const pill: OrderPill = orderPill(o, now);
  const test = isTestPayment(o);
  const paid = !!o.paidAt && (o.status === "paid" || o.status === "refunded");
  const tierOf = (name: string, sector: string | null) => (sector && sector !== name ? `${sector} · ${name}` : name);

  /* ---------- ingressos ---------- */
  const byTicket = new Map<string, (typeof transfers)[number][]>();
  for (const tr of transfers) byTicket.set(tr.ticketId, [...(byTicket.get(tr.ticketId) ?? []), tr]);
  const onResale = new Set(listed.map((l) => l.ticketId));
  const ticketRows: TicketRow[] = o.tickets.map((t) => {
    const trs = byTicket.get(t.id) ?? [];
    const pend = trs.find((x) => x.status === "pending");
    const accepted = [...trs].reverse().find((x) => x.status === "accepted");
    const mine = t.holderUserId === userId;
    let status = "Válido", tone: TicketRow["tone"] = "ok";
    if (t.status === "refunded") { status = "Reembolsado"; tone = ""; }
    else if (t.status === "cancelled") { status = "Cancelado"; tone = ""; }
    else if (t.status === "used" || t.checkedInAt) { status = `Usado em ${dateTimeShort(t.checkedInAt ?? t.updatedAt)}`; tone = "azul"; }
    else if (t.status === "transferred" && pend) { status = `Enviado para ${pend.toEmail} · aguardando`; tone = "warn"; }
    else if (!mine) { status = accepted ? (accepted.kind === "gift" ? `Recebido por ${accepted.toEmail}` : `Transferido para ${accepted.toEmail}`) : "Transferido"; tone = "azul"; }
    else if (onResale.has(t.id)) { status = "Anunciado na revenda"; tone = "warn"; }
    return {
      id: t.id, code: t.code, holder: t.holderName ?? o.buyerName ?? "—", tier: tierOf(t.ticketType.name, t.ticketType.sector), half: t.halfPrice,
      status, tone, mine: mine && (t.status === "valid" || t.status === "used" || t.status === "transferred"),
      pending: pend && mine && t.status === "transferred" ? { transferId: pend.id, ticketId: t.id, email: pend.toEmail, gift: pend.kind === "gift" } : null,
    };
  });
  const units = o.items.reduce((s, i) => s + i.quantity, 0);
  const movedOut = o.status === "paid" || o.status === "refunded" ? Math.max(0, units - o.tickets.length) : 0;

  /* ---------- valores ---------- */
  const holders = o.holders ?? [];
  const lines: PriceLine[] = [];
  for (const it of o.items) {
    // meia: pelos titulares do checkout (ou, nos pedidos antigos, pelos ingressos emitidos)
    const halfN = Math.min(it.quantity, o.meiaCents > 0
      ? (holders.length ? holders.filter((h) => h.ticketTypeId === it.ticketTypeId && h.meia).length : o.tickets.filter((t) => t.ticketTypeId === it.ticketTypeId && t.halfPrice).length)
      : 0);
    const name = it.ticketType.name;
    const sub = [it.ticketType.sector && it.ticketType.sector !== name ? it.ticketType.sector : null, it.ticketType.session ? dateTimeShort(it.ticketType.session.startAt) : null].filter(Boolean).join(" · ");
    const kindLabel = it.ticketType.kind === "meia" ? "Meia-entrada" : it.ticketType.kind === "social" ? "Social" : null;
    const full = it.quantity - halfN;
    if (full > 0) lines.push({ label: name, sub: [sub, kindLabel ?? (halfN ? "Inteira" : null)].filter(Boolean).join(" · "), qty: full, unitCents: it.unitPriceCents, totalCents: full * it.unitPriceCents });
    if (halfN > 0) {
      const unit = it.unitPriceCents - Math.round(it.unitPriceCents / 2);
      lines.push({ label: name, sub: [sub, "Meia-entrada"].filter(Boolean).join(" · "), qty: halfN, unitCents: unit, totalCents: halfN * unit });
    }
  }
  const done = refunds.filter((r) => r.status === "succeeded");
  const keptFeeCents = done.reduce((s, r) => s + r.keptFeeCents, 0);
  const money = {
    lines,
    itemsCents: o.subtotalCents - o.meiaCents,
    discountCents: o.discountCents, coupon: o.coupon?.code ?? null,
    feeCents: o.feeCents, absorbFee: e.absorbFee,
    interestCents: o.interestCents, installments: o.installments,
    totalCents: o.totalCents, refundedCents: o.refundedCents, keptFeeCents,
    netCents: o.totalCents - o.refundedCents,
    pendingRefundCents: refunds.filter((r) => r.status === "pending").reduce((s, r) => s + r.amountCents, 0),
  };

  /* ---------- pagamento ---------- */
  const method = o.paymentMethod === "card" ? "card" : o.paymentMethod === "free" || o.totalCents === 0 ? "free" : o.paymentMethod === "test" ? "test" : "pix";
  const each = o.installments > 1 ? Math.round(o.totalCents / o.installments) : 0;
  const pi = o.stripePaymentIntentId ?? (o.paymentRef?.startsWith("STRIPE-") ? o.paymentRef.slice(7) : null);
  const payment = {
    method: METHOD_LABEL[method] ?? "—",
    card: method === "card",
    installments: method === "card" && o.installments > 1 ? `${o.installments}x de ${brl(each)}${o.interestCents ? " com juros" : " sem juros"}` : method === "card" ? "À vista (1x)" : null,
    test, free: method === "free",
    ref: !test && pi ? `···${pi.slice(-6)}` : null,
    paidAt: paid && o.paidAt ? dateTimeShort(o.paidAt, " às ") : null,
  };

  /* ---------- linha do tempo ---------- */
  const tl: TimelineItem[] = [];
  const add = (at: Date | null | undefined, title: string, text?: string, tone?: TimelineItem["tone"]) => { if (at) tl.push({ at, when: dateTimeShort(at), title, text, tone }); };
  add(o.createdAt, "Pedido criado", `${units} ${units === 1 ? "ingresso" : "ingressos"} · ${o.totalCents ? brl(o.totalCents) : "grátis"}`);
  // os envios da compra nascem junto com a confirmação do pagamento: ele vem antes deles na linha do tempo
  const firstGift = transfers.find((t) => t.kind === "gift")?.createdAt;
  const paidAt = o.paidAt && firstGift && firstGift < o.paidAt ? firstGift : o.paidAt;
  if (paid) add(paidAt, test ? "Pagamento de teste confirmado" : method === "free" ? "Pedido confirmado" : "Pagamento aprovado",
    method === "free" ? "Sem cobrança" : `${payment.method}${payment.installments && method === "card" ? ` · ${payment.installments}` : ""}`, "ok");
  if (o.status === "pending" && !(o.expiresAt && o.expiresAt < now)) add(now, "Aguardando pagamento", o.expiresAt ? `A reserva vale até ${dateTimeShort(o.expiresAt)}.` : undefined, "warn");
  if (o.status === "expired" || (o.status === "pending" && o.expiresAt && o.expiresAt < now)) add(o.expiresAt ?? o.updatedAt, "Reserva expirada", "O pagamento não foi concluído a tempo e nada foi cobrado.", "bad");
  if (o.status === "cancelled" && !paid) add(o.updatedAt, "Pedido cancelado", o.paidAt ? undefined : "Nada foi cobrado.", "bad");
  for (const tr of transfers) {
    const t = o.tickets.find((x) => x.id === tr.ticketId);
    const who = t?.holderName ? `${t.holderName} (${tr.toEmail})` : tr.toEmail;
    add(tr.createdAt, tr.kind === "gift" ? "Ingresso enviado" : "Ingresso transferido", `${t?.code ?? ""} para ${who}`.trim());
    if (tr.status === "accepted") add(tr.acceptedAt, "Ingresso recebido", `${tr.toEmail} recebeu o ingresso ${t?.code ?? ""}`.trim(), "ok");
    if (tr.status === "cancelled") add(tr.updatedAt, "Envio cancelado", `${t?.code ? `${t.code} para ` : ""}${tr.toEmail}`);
  }
  for (const t of o.tickets) if (t.checkedInAt) add(t.checkedInAt, "Entrada no evento", `Ingresso ${t.code} lido na portaria`, "ok");
  for (const r of refunds) {
    const codes = r.ticketCodes?.length ? ` · ${r.ticketCodes.join(", ")}` : "";
    const free = r.amountCents === 0 && o.totalCents === 0;
    const parts = [
      free ? `Ingressos cancelados${codes}` : `${brl(r.amountCents)} devolvidos${codes}`,
      r.keptFeeCents ? `taxa de serviço de ${brl(r.keptFeeCents)} não reembolsada` : "",
      r.reason ? `Motivo: ${r.reason}` : "",
      r.status === "pending" ? "em processamento" : "",
    ].filter(Boolean);
    add(r.createdAt, free ? "Cancelamento" : REFUND_KIND[r.kind] ?? "Reembolso", parts.join(" · "), "azul");
  }
  for (const q of requests) {
    add(q.createdAt, "Você pediu reembolso", q.reason === "adiamento" ? "Motivo: o evento foi adiado" : "Motivo: o evento foi cancelado", "warn");
    if (q.status !== "pending") add(q.decidedAt ?? q.updatedAt, q.status === "approved" ? "Pedido de reembolso aprovado" : "Pedido de reembolso recusado", q.answer ? `Resposta: “${q.answer}”` : undefined, q.status === "approved" ? "ok" : "bad");
  }
  if (e.postponedAt) add(e.postponedAt, "Evento adiado", `${e.postponedFrom ? `De ${dateTimeShort(e.postponedFrom)} para` : "Nova data:"} ${dateTimeShort(e.startAt)}`, "warn");
  if (e.status === "cancelled") add(e.cancelledAt ?? e.startAt, "Evento cancelado pelo produtor", e.cancelReason ? `Motivo: ${e.cancelReason}` : undefined, "bad");
  tl.sort((a, b) => a.at.getTime() - b.at.getTime());

  /* ---------- cancelamento / reembolso ---------- */
  const policy = policyOf(e);
  const cancel: CancelView = { policy: policyText(policy), rules: EVENT_RULES, eventCancelled: e.status === "cancelled", can: null, request: null, requested: null, blocked: null, others: null };
  if (o.status === "paid") {
    const live = o.tickets.filter((t) => t.holderUserId === userId && (t.status === "valid" || t.status === "used" || t.status === "transferred"));
    const boxes = await Promise.all(live.map((t) => meuReembolso(t.id, userId)));
    const ok = live.filter((_, i) => boxes[i]?.cancel);
    const first = boxes.find((b) => b?.cancel)?.cancel ?? null;
    if (ok.length && first) {
      const all = await planMyCancel(o.id, userId, "all");
      if (all.ok) {
        cancel.can = {
          tickets: ok.map((t) => ({ code: t.code, label: `${t.holderName ?? "—"} · ${tierOf(t.ticketType.name, t.ticketType.sector)}` })),
          allCents: all.amountCents, allKeptFeeCents: all.keptFeeCents, full: all.full, free: all.free, test: all.test, legal: first.legal, until: first.until,
        };
      } else cancel.blocked = all.error;
      const out = live.filter((_, i) => !boxes[i]?.cancel);
      cancel.others = !out.length ? null
        : out.some((t) => t.status === "transferred") ? "Ingressos enviados para outra pessoa e ainda não aceitos ficam de fora. Cancele o envio para poder cancelá-los."
        : out.some((t) => t.status === "used" || t.checkedInAt) ? "Ingressos que já entraram no evento ficam de fora."
        : `Alguns ingressos ficam de fora: ${boxes.find((b) => b && !b.cancel && b.blocked)?.blocked ?? "eles não podem ser cancelados agora."}`;
    }
    const withReq = boxes.findIndex((b) => b?.request);
    const rq = withReq >= 0 ? boxes[withReq]?.request : null;
    if (rq) cancel.request = { code: live[withReq].code, ...rq };
    cancel.requested = boxes.find((b) => b?.requested)?.requested ?? (requests.length ? { status: requests[requests.length - 1].status, answer: requests[requests.length - 1].answer ?? "" } : null);
    if (!cancel.can) {
      // o motivo mais útil: o de um ingresso válido; sem ingresso na conta, explica
      const why = boxes.find((b, i) => b?.blocked && live[i].status === "valid")?.blocked ?? boxes.find((b) => b?.blocked)?.blocked ?? null;
      cancel.blocked ??= why ?? (live.length ? null : o.tickets.some((t) => t.holderUserId !== userId && (t.status === "valid" || t.status === "used"))
        ? "Os ingressos deste pedido já estão com outras pessoas. Só dá para cancelar ingressos que continuam na sua conta."
        : "Não há ingressos ativos neste pedido para cancelar.");
    }
  }

  return {
    id: o.id, number: o.number ?? 0, status: o.status, pill, test,
    createdAt: o.createdAt, purchasedAt: dateTimeShort(o.createdAt, " às "),
    pendingOpen: o.status === "pending" && !(o.expiresAt && o.expiresAt < now),
    expiresAt: o.expiresAt ? dateTimeShort(o.expiresAt) : null,
    event: {
      slug: e.slug, title: e.title, flyerId: e.flyerId, status: e.status,
      // como no ingresso: data por extenso + horário (o do produtor, se ele escreveu um)
      when: `${e.dateFullLabel ?? dateFull(e.startAt)} · ${L.doors || hourLabel(e.startAt)}`,
      where: [L.venue, L.addr].filter(Boolean).join(" · "),
      postponed: e.postponedAt && e.postponedFrom ? { from: dateFull(e.postponedFrom), to: L.dateFull } : null,
      past: (e.endAt ?? new Date(e.startAt.getTime() + 6 * H)) < now,
    },
    tickets: ticketRows, movedOut,
    money, payment,
    buyer: { name: o.buyerName ?? "", email: o.buyerEmail ?? "", phone: formatPhone(o.buyerPhone), cpf: maskCpfHidden(o.buyerCpf) },
    timeline: tl,
    cancel,
  };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof orderDetail>>>;
