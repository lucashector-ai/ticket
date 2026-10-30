"use server";

import { and, count, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope } from "@/lib/data/painel";
import { eventOrderDetail, searchEventOrders, type RefundOrderDetail, type RefundOrderRow } from "@/lib/data/reembolsos";
import { dateLabels } from "@/lib/criar/save";
import { spDate } from "@/lib/criar/model";
import { dateFull, dateFullInline, dateNice, hourLabel } from "@/lib/format";
import { cancelProgress, processCancellation, startCancellation, type CancelProgress } from "@/lib/payments/cancel-event";
import { previewRefund, refundTickets } from "@/lib/payments/refund";
import { mailSecurityNotice, userContact } from "@/lib/notify";
import { mailEventPostponed, mailRefundRequestRejected } from "@/lib/refund-mail";
import { POLICY_HOURS, POSTPONE_REFUND_DAYS } from "@/lib/refund-policy";

/*
 * Painel → evento → Cancelamentos e reembolsos. Só o dono e os administradores da equipe (a portaria não);
 * tudo conferido aqui no servidor: o evento tem de ser do produtor e o pedido, do evento.
 */

const { events, orderRefunds, refundRequests, eventSessions, ticketTypes, tickets } = schema;
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string; code?: string };
const uuid = z.uuid();

async function eventScope(eventId: string) {
  if (!uuid.safeParse(eventId).success) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  if (s.role === "portaria") return null;
  const ev = s.events.find((e) => e.id === eventId);
  return ev ? { user, ev, role: s.role, org: s.org, actor: { userId: user.id, name: user.name || user.email || "Equipe" } } : null;
}
const DENIED = { ok: false as const, error: "Só o dono e os administradores do evento podem fazer isso." };

/** Freio contra uso em massa por engano (ou conta comprometida): no máximo 40 reembolsos por minuto por pessoa. */
async function tooFast(userId: string) {
  const [r] = await db.select({ n: count() }).from(orderRefunds).where(and(eq(orderRefunds.actorUserId, userId), gt(orderRefunds.createdAt, new Date(Date.now() - 60_000)), sql`${orderRefunds.kind} <> 'event'`));
  return (r?.n ?? 0) >= 40;
}

const refresh = (eventId: string) => revalidatePath(`/painel/evento/${eventId}`);

export async function searchRefundOrders(eventId: string, q: string): Promise<R<{ rows: RefundOrderRow[] }>> {
  const s = await eventScope(eventId);
  if (!s) return DENIED;
  return { ok: true, rows: await searchEventOrders(eventId, String(q ?? "")) };
}

export async function loadRefundOrder(eventId: string, orderId: string): Promise<R<{ order: RefundOrderDetail }>> {
  const s = await eventScope(eventId);
  if (!s) return DENIED;
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Pedido não encontrado." };
  const order = await eventOrderDetail(eventId, orderId);
  return order ? { ok: true, order } : { ok: false, error: "Pedido não encontrado." };
}

const selSchema = z.union([z.literal("all"), z.array(z.uuid()).min(1).max(100)]);

export type RefundPreview = { amountCents: number; feeCents: number; producerCents: number; checkedIn: number; full: boolean; free: boolean; test: boolean; resale: boolean; tickets: number };

/** Valor exato que volta para o comprador e o que sai do saldo do produtor (mostrado na confirmação). */
export async function previewOrderRefund(eventId: string, orderId: string, sel: "all" | string[]): Promise<R<{ p: RefundPreview }>> {
  const s = await eventScope(eventId);
  if (!s) return DENIED;
  const ps = selSchema.safeParse(sel);
  if (!uuid.safeParse(orderId).success || !ps.success) return { ok: false, error: "Escolha os ingressos." };
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId), columns: { eventId: true, status: true } });
  if (!order || order.eventId !== eventId) return { ok: false, error: "Pedido não encontrado." };
  if (order.status !== "paid") return { ok: false, error: "Este pedido não tem nada a reembolsar." };
  const p = await previewRefund(orderId, ps.data);
  if ("error" in p) return { ok: false, error: p.error ?? "Não foi possível calcular." };
  return { ok: true, p: { amountCents: p.amountCents, feeCents: p.feeCents, producerCents: p.producerCents, checkedIn: p.checkedIn, full: p.full, free: p.free, test: p.test, resale: p.resale, tickets: p.ticketIds.length } };
}

const refundSchema = z.object({
  eventId: z.uuid(), orderId: z.uuid(), sel: selSchema,
  note: z.string().trim().max(500, "Recado: até 500 caracteres."),
  allowCheckedIn: z.boolean(),
});

export async function refundOrderAction(input: z.input<typeof refundSchema>): Promise<R<{ amountCents: number; test: boolean; free: boolean }>> {
  const p = refundSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  const s = await eventScope(d.eventId);
  if (!s) return DENIED;
  if (await tooFast(s.user.id)) return { ok: false, error: "Muitos reembolsos em sequência. Espere um minuto e tente de novo." };
  const r = await refundTickets({
    orderId: d.orderId, ticketIds: d.sel, kind: d.sel === "all" ? "order" : "tickets", actor: s.actor, note: d.note || null,
    allowCheckedIn: d.allowCheckedIn, eventId: d.eventId,
  });
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  // resolve um pedido de reembolso pendente do mesmo pedido, se o produtor reembolsou tudo
  if (d.sel === "all") await db.update(refundRequests).set({ status: "approved", decidedByUserId: s.user.id, decidedAt: new Date() }).where(and(eq(refundRequests.orderId, d.orderId), eq(refundRequests.status, "pending")));
  refresh(d.eventId);
  return { ok: true, amountCents: r.amountCents, test: r.test, free: r.free };
}

/* ---------- cancelar o evento ---------- */

const cancelSchema = z.object({ eventId: z.uuid(), confirmTitle: z.string().max(220), reason: z.string().trim().max(600, "Motivo: até 600 caracteres.") });

export async function cancelEventAction(input: z.input<typeof cancelSchema>): Promise<R<{ progress: CancelProgress }>> {
  const p = cancelSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  const s = await eventScope(d.eventId);
  if (!s) return DENIED;
  if (d.confirmTitle.trim().toLowerCase() !== s.ev.title.trim().toLowerCase()) return { ok: false, error: "Digite o nome do evento igual para confirmar." };
  if (s.ev.status === "cancelled") return { ok: false, error: "Este evento já foi cancelado." };
  const started = await startCancellation(d.eventId, s.actor, d.reason || null);
  if (!started) return { ok: false, error: "Não foi possível cancelar este evento." };
  // administrador cancelou: o dono fica sabendo (o dinheiro sai do saldo dele)
  const ownerId = s.org?.ownerUserId;
  if (ownerId && ownerId !== s.user.id) {
    const title = s.ev.title, who = s.actor.name;
    after(async () => {
      const c = await userContact(ownerId);
      if (c) await mailSecurityNotice(c.email, "Um evento seu foi cancelado", `${who} cancelou “${title}” no painel da Tickets Win. Todos os compradores estão sendo reembolsados e o valor sai do seu saldo no Banco Tickets Win.`);
    });
  }
  await processCancellation(d.eventId, { limit: 5, budgetMs: 8_000 });
  revalidatePath("/painel");
  refresh(d.eventId);
  return { ok: true, progress: await cancelProgress(d.eventId) };
}

/** Mais um lote do reembolso do evento cancelado (o painel chama em sequência enquanto o produtor acompanha). */
export async function cancelStep(eventId: string, retryFailed = false): Promise<R<{ progress: CancelProgress; more: boolean }>> {
  const s = await eventScope(eventId);
  if (!s) return DENIED;
  if (s.ev.status !== "cancelled") return { ok: false, error: "Este evento não está cancelado." };
  const r = await processCancellation(eventId, { limit: retryFailed ? 10 : 8, budgetMs: 12_000, retryFailed });
  return { ok: true, progress: await cancelProgress(eventId), more: r.more };
}

/* ---------- adiar ---------- */

const postponeSchema = z.object({
  eventId: z.uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Escolha a nova data e o horário."),
  note: z.string().trim().max(600, "Recado: até 600 caracteres."),
});

const spParts = (d: Date) => {
  const o: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[x.type] = x.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
};

export async function postponeEventAction(input: z.input<typeof postponeSchema>): Promise<R<{ until: string }>> {
  const p = postponeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  const s = await eventScope(d.eventId);
  if (!s) return DENIED;
  const ev = await db.query.events.findFirst({ where: eq(events.id, d.eventId), with: { sessions: { with: { venue: true } } } });
  if (!ev || ev.status !== "published") return { ok: false, error: ev?.status === "cancelled" ? "Este evento foi cancelado." : "Só eventos publicados podem ser adiados." };
  const [date, time] = d.start.split("T");
  const next = spDate(date, time);
  if (!next) return { ok: false, error: "Data inválida." };
  if (next.getTime() < Date.now() + 3_600_000) return { ok: false, error: "A nova data precisa ser no futuro." };
  if (next.getTime() > Date.now() + 2 * 365 * 86_400_000) return { ok: false, error: "A nova data precisa ser nos próximos 2 anos." };
  const delta = next.getTime() - ev.startAt.getTime();
  if (Math.abs(delta) < 60_000) return { ok: false, error: "Essa já é a data do evento." };
  const shift = (x: Date | null) => (x ? new Date(x.getTime() + delta) : null);

  const sessions = [...ev.sessions].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (const ss of sessions) await db.update(eventSessions).set({ startAt: shift(ss.startAt)!, doorsAt: shift(ss.doorsAt) }).where(eq(eventSessions.id, ss.id));
  const starts = sessions.length ? sessions.map((x) => shift(x.startAt)!) : [next];
  const nCities = new Set(sessions.map((x) => x.venue?.cityId).filter(Boolean)).size;
  const labels = starts.length > 1 ? dateLabels(starts, nCities, ev.format === "turne") : { label: dateNice(next), full: dateFull(next) };
  const doors = sessions[0]?.doorsAt ? shift(sessions[0].doorsAt) : null;
  const doorsLabel = ev.doorsLabel ? (doors ? `Portões ${hourLabel(doors)} · início ${hourLabel(starts[0])}${ev.doorsLabel.includes("varia") ? " (varia por data)" : ""}` : `Início ${hourLabel(starts[0])}`) : null;
  // o formulário de edição guarda as datas: acompanha a mudança para a próxima edição não voltar a data antiga
  const draft = ev.draft as { sessions?: { date: string; time: string; doors?: string; end?: string }[] } | null;
  if (draft?.sessions?.length) {
    draft.sessions = draft.sessions.map((x) => {
      const st = spDate(x.date, x.time);
      if (!st) return x;
      const ns = spParts(new Date(st.getTime() + delta));
      const mv = (t?: string) => { if (!t) return t; const v = spDate(x.date, t); return v ? spParts(new Date(v.getTime() + delta)).time : t; };
      return { ...x, date: ns.date, time: ns.time, doors: mv(x.doors) ?? "", end: mv(x.end) };
    });
  }
  const now = new Date();
  const until = new Date(now.getTime() + POSTPONE_REFUND_DAYS * 86_400_000);
  await db.update(events).set({
    startAt: next, endAt: shift(ev.endAt), dateLabel: labels.label, dateFullLabel: labels.full, ...(doorsLabel ? { doorsLabel } : {}),
    ...(draft ? { draft: draft as Record<string, unknown> } : {}),
    postponedAt: now, postponedFrom: ev.startAt, refundRequestsUntil: until,
  }).where(eq(events.id, ev.id));
  // fim das vendas acompanha a data; o lembrete da véspera volta a sair na nova data
  await db.update(ticketTypes).set({ salesEnd: sql`${ticketTypes.salesEnd} + make_interval(secs => ${delta / 1000})` }).where(and(eq(ticketTypes.eventId, ev.id), sql`${ticketTypes.salesEnd} is not null`));
  await db.update(tickets).set({ remindedAt: null }).where(eq(tickets.eventId, ev.id));
  const from = ev.startAt, note = d.note || null;
  after(() => mailEventPostponed(ev.id, from, note));
  revalidatePath(`/eventos/${ev.slug}`);
  revalidatePath("/painel");
  refresh(ev.id);
  return { ok: true, until: dateFullInline(until) };
}

/* ---------- pedidos de reembolso dos compradores ---------- */

const decideSchema = z.object({ eventId: z.uuid(), requestId: z.uuid(), approve: z.boolean(), answer: z.string().trim().max(500, "Resposta: até 500 caracteres."), allowCheckedIn: z.boolean().optional() });

export async function decideRefundRequest(input: z.input<typeof decideSchema>): Promise<R<{ amountCents?: number }>> {
  const p = decideSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const d = p.data;
  const s = await eventScope(d.eventId);
  if (!s) return DENIED;
  const req = await db.query.refundRequests.findFirst({ where: and(eq(refundRequests.id, d.requestId), eq(refundRequests.eventId, d.eventId)) });
  if (!req || req.status !== "pending") return { ok: false, error: "Este pedido já foi respondido." };
  if (!d.approve) {
    const [u] = await db.update(refundRequests).set({ status: "rejected", answer: d.answer || null, decidedByUserId: s.user.id, decidedAt: new Date() })
      .where(and(eq(refundRequests.id, req.id), eq(refundRequests.status, "pending"))).returning({ id: refundRequests.id });
    if (u) { const ans = d.answer || null; after(() => mailRefundRequestRejected(req.orderId, ans)); }
    refresh(d.eventId);
    return { ok: true };
  }
  if (await tooFast(s.user.id)) return { ok: false, error: "Muitos reembolsos em sequência. Espere um minuto e tente de novo." };
  const r = await refundTickets({ orderId: req.orderId, ticketIds: "all", kind: "request", actor: s.actor, note: d.answer || null, allowCheckedIn: !!d.allowCheckedIn, eventId: d.eventId });
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  await db.update(refundRequests).set({ status: "approved", answer: d.answer || null, decidedByUserId: s.user.id, decidedAt: new Date() }).where(eq(refundRequests.id, req.id));
  refresh(d.eventId);
  return { ok: true, amountCents: r.amountCents };
}

/* ---------- política de cancelamento ---------- */

const policySchema = z.object({ eventId: z.uuid(), mode: z.enum(["legal", "until"]), hoursBefore: z.number().int(), keepFee: z.boolean() });

export async function saveCancelPolicy(input: z.input<typeof policySchema>): Promise<R> {
  const p = policySchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Confira a política." };
  const d = p.data;
  const s = await eventScope(d.eventId);
  if (!s) return DENIED;
  if (d.mode === "until" && !(POLICY_HOURS as readonly number[]).includes(d.hoursBefore)) return { ok: false, error: "Escolha um dos prazos da lista." };
  await db.update(events).set({ cancelPolicy: d.mode === "legal" ? null : { mode: "until", hoursBefore: d.hoursBefore, keepFee: d.keepFee } }).where(eq(events.id, d.eventId));
  revalidatePath(`/eventos/${s.ev.slug}`);
  refresh(d.eventId);
  return { ok: true };
}
