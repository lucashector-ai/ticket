import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailEnabled, sendEmails, sendTx, siteBase, type Mail } from "@/lib/email";
import { brl, dateFullInline } from "@/lib/format";
import { renderTx, type TxBlock } from "@/lib/mail/tx";
import { userContact } from "@/lib/notify";
import { eventLabels } from "@/lib/tickets/labels";
import { isTestPayment } from "@/lib/payments/stripe";
import { POSTPONE_REFUND_DAYS } from "@/lib/refund-policy";

/*
 * E-mails de cancelamento, reembolso e adiamento. O prazo do dinheiro é dito de forma genérica: no Pix volta
 * para a conta de origem e no cartão como estorno na fatura, e quanto demora depende do banco ou do cartão.
 */

const { orders, tickets, events, guestListEntries } = schema;
const firstName = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";
const hello = (n?: string | null) => (firstName(n) ? `Oi, ${firstName(n)}!` : "Oi!");
const safe = <A extends unknown[]>(name: string, fn: (...a: A) => Promise<unknown>) => async (...a: A) => {
  if (!emailEnabled()) return;
  try { await fn(...a); } catch (e) { console.error("refund-mail", name, e); }
};
export const MONEY_BACK = "O valor volta pelo mesmo meio de pagamento: no Pix, para a conta de onde saiu; no cartão, como estorno na fatura. O prazo para aparecer depende do seu banco ou da operadora do cartão.";

type Ev = typeof events.$inferSelect & { venue: (typeof schema.venues.$inferSelect & { city: typeof schema.cities.$inferSelect }) | null };
function eventBlock(e: Ev): TxBlock {
  const L = eventLabels(e);
  return { kind: "event", title: e.title, when: L.dateFull + (L.doors ? ` · ${L.doors}` : ""), where: [L.venue, L.addr].filter(Boolean).join(" · "), url: `/eventos/${e.slug}` };
}

type RefundMail = { amountCents: number; codes: string[]; note: string | null; kind: string; keptFeeCents: number; free: boolean };

/** Reembolso / cancelamento concluído: quem pagou recebe o valor e os códigos; quem recebeu o ingresso de presente é avisado. */
export const mailTicketsRefunded = safe("refund", async (orderId: string, m: RefundMail) => {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { event: { with: { venue: { with: { city: true } } } } } });
  if (!o) return;
  const e = o.event as Ev;
  const to = o.buyerEmail || (await userContact(o.userId))?.email;
  const n = m.codes.length;
  const what = n === 1 ? "1 ingresso" : `${n} ingressos`;
  const test = isTestPayment(o);
  const cancelledEvent = m.kind === "event";
  const lead = cancelledEvent
    ? `${e.title} foi cancelado pelo produtor.${m.free ? " Seu ingresso foi cancelado." : ` Reembolsamos ${brl(m.amountCents)}, o valor integral pago, com a taxa de serviço.`}`
    : m.kind === "buyer"
      ? `Seu cancelamento foi confirmado: ${what} de ${e.title} ${n === 1 ? "foi cancelado" : "foram cancelados"}.`
      : m.kind === "request"
        ? `Seu pedido de reembolso para ${e.title} foi aprovado.`
        : `O produtor de ${e.title} ${m.free ? "cancelou" : "reembolsou"} ${what} do seu pedido.`;
  const rows: [string, string][] = [["Evento", e.title], ["Pedido", `nº ${o.number ?? "—"}`]];
  if (n) rows.push(["Ingressos cancelados", m.codes.join(", ")]);
  if (!m.free) rows.push(["Valor reembolsado", brl(m.amountCents)]);
  if (m.keptFeeCents > 0) rows.push(["Taxa de serviço (não reembolsável neste prazo)", brl(m.keptFeeCents)]);
  if (to) {
    await sendTx(to, cancelledEvent ? `Evento cancelado: ${e.title}` : m.free ? `Ingresso cancelado: ${e.title}` : `Reembolso de ${brl(m.amountCents)}: ${e.title}`, {
      preheader: m.free ? `${what} cancelado(s).` : `Reembolsamos ${brl(m.amountCents)} do pedido nº ${o.number ?? ""}.`,
      eyebrow: cancelledEvent ? "Evento cancelado" : `Pedido nº ${o.number ?? ""}`.trim(),
      title: cancelledEvent ? "O evento foi cancelado" : m.free ? "Ingresso cancelado" : "Reembolso feito",
      paragraphs: [
        `${hello(o.buyerName)} ${lead}`,
        ...(m.free || m.amountCents === 0 ? [] : [test ? "Este pedido foi feito no modo de teste: nenhum valor foi cobrado de verdade." : MONEY_BACK]),
        `${n === 1 ? "O QR code deste ingresso deixou" : "Os QR codes destes ingressos deixaram"} de valer na entrada.`,
      ],
      blocks: [
        ...(m.note ? [{ kind: "note", text: `Recado do produtor: ${m.note}` } as TxBlock] : []),
        eventBlock(e),
        { kind: "rows", rows },
      ],
      cta: { label: "Ver minhas compras", url: "/conta/compras" },
      reason: "Você recebeu este e-mail porque fez um pedido na Tickets Win.",
    });
  }
  // ingressos que estavam com outras pessoas (presente ou transferência aceita)
  if (!n) return;
  const held = await db.query.tickets.findMany({ where: and(eq(tickets.orderId, o.id), inArray(tickets.code, m.codes)), columns: { holderUserId: true, code: true } });
  const others = [...new Set(held.filter((t) => t.holderUserId !== o.userId).map((t) => t.holderUserId))];
  for (const uid of others) {
    const c = await userContact(uid);
    if (!c || c.email === to) continue;
    const codes = held.filter((t) => t.holderUserId === uid).map((t) => t.code);
    await sendTx(c.email, cancelledEvent ? `Evento cancelado: ${e.title}` : `Seu ingresso de ${e.title} foi cancelado`, {
      preheader: "O ingresso que você recebeu deixou de valer.",
      eyebrow: cancelledEvent ? "Evento cancelado" : "Ingresso cancelado",
      title: cancelledEvent ? "O evento foi cancelado" : "Ingresso cancelado",
      paragraphs: [`${hello(c.name)} ${cancelledEvent ? `${e.title} foi cancelado pelo produtor.` : `O ingresso de ${e.title} que você recebeu foi cancelado.`} O reembolso vai para quem comprou, pelo mesmo meio de pagamento usado na compra.`],
      blocks: [eventBlock(e), { kind: "rows", rows: [["Ingressos", codes.join(", ")]] }],
      cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
      reason: "Você recebeu este e-mail porque tinha um ingresso deste evento na Tickets Win.",
    });
  }
});

/** Cancelamento do evento: quem estava na lista free é avisado (não há o que reembolsar). */
export const mailGuestsEventCancelled = safe("guest-cancel", async (eventId: string, reason: string | null) => {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), with: { venue: { with: { city: true } } } });
  if (!e) return;
  const rows = await db.query.guestListEntries.findMany({ where: and(eq(guestListEntries.eventId, eventId), isNotNull(guestListEntries.email)), columns: { email: true, name: true } });
  const mails: Mail[] = rows.map((r) => ({
    to: r.email!, subject: `Evento cancelado: ${e.title}`,
    ...renderTx({
      preheader: "O evento não vai mais acontecer.", eyebrow: "Evento cancelado", title: "O evento foi cancelado",
      paragraphs: [`${hello(r.name)} ${e.title} foi cancelado pelo produtor, então o seu nome na lista free não vale mais.`],
      blocks: [...(reason ? [{ kind: "note", text: `Recado do produtor: ${reason}` } as TxBlock] : []), eventBlock(e as Ev)],
      reason: `Você recebeu este e-mail porque estava na lista free de ${e.title} na Tickets Win.`,
    }, siteBase()),
  }));
  await sendEmails(mails);
});

/** Adiamento: todo mundo que comprou (e a lista free) recebe a nova data e o prazo para pedir reembolso. */
export const mailEventPostponed = safe("postpone", async (eventId: string, from: Date, note: string | null) => {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), with: { venue: { with: { city: true } } } });
  if (!e) return;
  const buyers = await db.selectDistinctOn([orders.buyerEmail], { email: orders.buyerEmail, name: orders.buyerName })
    .from(orders).where(and(eq(orders.eventId, eventId), eq(orders.status, "paid"), isNotNull(orders.buyerEmail)));
  const guests = await db.query.guestListEntries.findMany({ where: and(eq(guestListEntries.eventId, eventId), isNotNull(guestListEntries.email)), columns: { email: true, name: true } });
  const until = e.refundRequestsUntil;
  const seen = new Set<string>();
  const mails: Mail[] = [];
  for (const r of [...buyers.map((b) => ({ ...b, guest: false })), ...guests.map((g) => ({ ...g, guest: true }))]) {
    const to = r.email?.toLowerCase();
    if (!to || seen.has(to)) continue;
    seen.add(to);
    mails.push({
      to, subject: `Nova data: ${e.title}`,
      ...renderTx({
        preheader: `O evento foi adiado para ${dateFullInline(e.startAt)}.`, eyebrow: "Evento adiado", title: "O evento mudou de data",
        paragraphs: [
          `${hello(r.name)} ${e.title} foi adiado. A data anterior era ${dateFullInline(from)}; a nova data está abaixo.`,
          r.guest ? "Seu nome continua na lista free para a nova data." : "Seu ingresso continua valendo para a nova data, com o mesmo QR code. Não precisa fazer nada.",
          ...(!r.guest && until ? [`Se a nova data não der para você, peça o reembolso até ${dateFullInline(until)} (${POSTPONE_REFUND_DAYS} dias após este aviso): abra o ingresso em Meus ingressos e toque em Pedir reembolso. ${MONEY_BACK}`] : []),
        ],
        blocks: [...(note ? [{ kind: "note", text: `Recado do produtor: ${note}` } as TxBlock] : []), eventBlock(e as Ev)],
        cta: { label: r.guest ? "Ver o evento" : "Ver meus ingressos", url: r.guest ? `/eventos/${e.slug}` : "/meus-ingressos" },
        reason: `Você recebeu este e-mail porque tem ${r.guest ? "o nome na lista free" : "ingresso"} de ${e.title} na Tickets Win.`,
      }, siteBase()),
    });
  }
  await sendEmails(mails);
});

/** Pedido de reembolso recusado pelo produtor (o aprovado vai pelo e-mail de reembolso). */
export const mailRefundRequestRejected = safe("request-no", async (orderId: string, answer: string | null) => {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { event: { columns: { title: true, slug: true } } } });
  if (!o) return;
  const to = o.buyerEmail || (await userContact(o.userId))?.email;
  if (!to) return;
  await sendTx(to, `Pedido de reembolso: ${o.event.title}`, {
    preheader: "O produtor respondeu ao seu pedido de reembolso.", eyebrow: `Pedido nº ${o.number ?? ""}`.trim(), title: "Pedido de reembolso não aprovado",
    paragraphs: [`${hello(o.buyerName)} O produtor de ${o.event.title} não aprovou o seu pedido de reembolso. Seus ingressos continuam valendo.`, "Se achar que há um engano, fale com a gente pelo formulário de contato informando o número do pedido."],
    blocks: answer ? [{ kind: "note", text: `Resposta do produtor: ${answer}` }] : [],
    cta: { label: "Falar com a Tickets Win", url: "/contato?assunto=reembolso" },
    reason: "Você recebeu este e-mail porque pediu um reembolso na Tickets Win.",
  });
});
