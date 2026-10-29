"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { meuReembolso, planMyCancel } from "@/lib/data/meu-reembolso";
import { refundTickets } from "@/lib/payments/refund";
import { cancelWindow, policyOf } from "@/lib/refund-policy";

/*
 * Lado do comprador: cancelar o próprio ingresso pela política do evento e pedir reembolso quando o
 * evento foi adiado (ou cancelado e ainda não reembolsado). Tudo é conferido de novo aqui no servidor.
 */

const { tickets, orderRefunds, refundRequests } = schema;
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const CODE_RE = /^(TW|ONDE)-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function cancelMyTicket(code: string, expectCents: number): Promise<R<{ amountCents: number; free: boolean }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta de novo." };
  const c = String(code ?? "").toUpperCase();
  if (!CODE_RE.test(c) || !z.number().int().min(0).safeParse(expectCents).success) return { ok: false, error: "Ingresso não encontrado." };
  const [recent] = await db.select({ n: count() }).from(orderRefunds).where(and(eq(orderRefunds.actorUserId, user.id), eq(orderRefunds.kind, "buyer"), gt(orderRefunds.createdAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= 10) return { ok: false, error: "Muitos cancelamentos em pouco tempo. Tente de novo mais tarde." };
  const t = await db.query.tickets.findFirst({ where: eq(tickets.code, c), columns: { id: true, orderId: true }, with: { order: { columns: { paidAt: true, createdAt: true, totalCents: true } }, event: { columns: { id: true, slug: true, startAt: true, cancelPolicy: true } } } });
  if (!t) return { ok: false, error: "Ingresso não encontrado." };
  // mesma regra da tela (dono, comprador, sem check-in, sem revenda, dentro do prazo)
  const box = await meuReembolso(t.id, user.id);
  if (!box?.cancel) return { ok: false, error: box?.blocked ?? "Este ingresso não pode ser cancelado agora." };
  if (box.cancel.amountCents !== expectCents) return { ok: false, error: "O valor mudou. Atualize a página e confira antes de cancelar." };
  const free = t.order.totalCents === 0;
  const w = free ? null : cancelWindow(policyOf(t.event), { paidAt: t.order.paidAt ?? t.order.createdAt, startAt: t.event.startAt });
  const r = await refundTickets({
    orderId: t.orderId, ticketIds: [t.id], kind: "buyer", actor: { userId: user.id, name: user.name || user.email || "Comprador" },
    keepFee: !!(w && w.allowed && w.keepFee), eventId: t.event.id,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/meus-ingressos");
  revalidatePath(`/ingressos/${c}`);
  return { ok: true, amountCents: r.amountCents, free: r.free };
}

const orderCancelSchema = z.object({
  orderId: z.string().uuid(),
  codes: z.array(z.string().toUpperCase().regex(CODE_RE)).min(1).max(50),
});

/** Detalhes do pedido: quanto volta se cancelar estes ingressos (o mesmo cálculo do cancelamento). */
export async function previewMyCancel(input: z.input<typeof orderCancelSchema>): Promise<R<{ amountCents: number; keptFeeCents: number; full: boolean }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta de novo." };
  const p = orderCancelSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Escolha os ingressos." };
  const plan = await planMyCancel(p.data.orderId, user.id, p.data.codes);
  if (!plan.ok) return plan;
  return { ok: true, amountCents: plan.amountCents, keptFeeCents: plan.keptFeeCents, full: plan.full };
}

/** Detalhes do pedido: o comprador cancela o pedido inteiro ou os ingressos escolhidos, pela política do evento. */
export async function cancelMyTickets(input: z.input<typeof orderCancelSchema> & { expectCents: number }): Promise<R<{ amountCents: number; free: boolean; tickets: number }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta de novo." };
  const p = orderCancelSchema.extend({ expectCents: z.number().int().min(0) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Escolha os ingressos." };
  const [recent] = await db.select({ n: count() }).from(orderRefunds).where(and(eq(orderRefunds.actorUserId, user.id), eq(orderRefunds.kind, "buyer"), gt(orderRefunds.createdAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= 10) return { ok: false, error: "Muitos cancelamentos em pouco tempo. Tente de novo mais tarde." };
  // dono do pedido, ingressos ainda com ele, mesma regra da caixa do ingresso, dentro do prazo
  const plan = await planMyCancel(p.data.orderId, user.id, p.data.codes);
  if (!plan.ok) return plan;
  if (plan.amountCents !== p.data.expectCents) return { ok: false, error: "O valor mudou. Atualize a página e confira antes de cancelar." };
  const r = await refundTickets({
    orderId: p.data.orderId, ticketIds: plan.ticketIds, kind: "buyer", actor: { userId: user.id, name: user.name || user.email || "Comprador" }, keepFee: plan.keepFee,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/meus-ingressos");
  revalidatePath("/conta/compras");
  revalidatePath(`/conta/compras/${p.data.orderId}`);
  for (const c of plan.codes) revalidatePath(`/ingressos/${c}`);
  return { ok: true, amountCents: r.amountCents, free: r.free, tickets: r.tickets };
}

const reqSchema = z.object({ code: z.string().regex(CODE_RE), message: z.string().trim().max(500, "Mensagem: até 500 caracteres.") });

export async function requestRefund(input: z.input<typeof reqSchema>): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta de novo." };
  const p = reqSchema.safeParse({ ...input, code: String(input?.code ?? "").toUpperCase() });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const [recent] = await db.select({ n: count() }).from(refundRequests).where(and(eq(refundRequests.userId, user.id), gt(refundRequests.createdAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= 5) return { ok: false, error: "Muitos pedidos em pouco tempo. Tente de novo mais tarde." };
  const t = await db.query.tickets.findFirst({ where: eq(tickets.code, p.data.code), columns: { id: true, orderId: true, eventId: true } });
  if (!t) return { ok: false, error: "Ingresso não encontrado." };
  const box = await meuReembolso(t.id, user.id);
  if (!box?.request) return { ok: false, error: box?.requested?.status === "pending" ? "Você já pediu o reembolso deste pedido." : "Este pedido não pode pedir reembolso agora." };
  const [row] = await db.insert(refundRequests).values({ orderId: t.orderId, eventId: t.eventId, userId: user.id, reason: box.request.reason, message: p.data.message || null })
    .onConflictDoNothing().returning({ id: refundRequests.id });
  if (!row) return { ok: false, error: "Você já pediu o reembolso deste pedido." };
  revalidatePath(`/ingressos/${p.data.code}`);
  return { ok: true };
}
