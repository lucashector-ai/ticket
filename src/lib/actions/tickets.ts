"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { mailTransferAccepted, mailTransferCancelled, mailTransferSent } from "@/lib/notify";
import { deadlineLabel, deadlineOpen } from "@/lib/refund-policy";
import { ticketCode } from "@/lib/tickets/code";
import { allowHit } from "@/lib/rate-limit";

const { tickets, ticketTransfers } = schema;

/** Transfere um ingresso para outro e-mail. O QR antigo é cancelado na hora (segredo rotacionado);
 *  o ingresso vai para a conta de quem recebe quando a pessoa aceita pelo link do e-mail. */
export async function transferTicket(_prev: { ok?: boolean; error?: string } | null, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return { error: "Faça login para transferir." };
  const parsed = z.object({ ticketId: z.string().uuid(), email: z.string().email("Confira o e-mail.") }).safeParse({ ticketId: formData.get("ticketId"), email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.email.toLowerCase() === user.email?.toLowerCase()) return { error: "Esse é o seu próprio e-mail." };
  const t = await db.query.tickets.findFirst({ where: and(eq(tickets.id, parsed.data.ticketId), eq(tickets.holderUserId, user.id)), with: { event: { columns: { transferEnabled: true, startAt: true, transferUntilHours: true } } } });
  if (!t) return { error: "Ingresso não encontrado." };
  if (!t.event.transferEnabled) return { error: "O produtor deste evento não permite transferir ingressos." };
  // prazo do produtor (não vale para o envio do ingresso de outra pessoa na compra, que não passa por aqui)
  if (!deadlineOpen(t.event.startAt, t.event.transferUntilHours)) return { error: `O prazo para transferir acabou (${deadlineLabel(t.event.transferUntilHours)}).` };
  if (t.status !== "valid") return { error: "Este ingresso não pode ser transferido." };
  const listed = await db.query.resaleListings.findFirst({ where: and(eq(schema.resaleListings.ticketId, t.id), inArray(schema.resaleListings.status, ["active", "reserved"])), columns: { id: true } });
  if (listed) return { error: "Este ingresso está na revenda. Tire do anúncio antes de transferir." };
  // cada transferência manda um e-mail: transferir e cancelar em sequência viraria disparo de e-mails
  if (!(await allowHit(`transfer:${user.id}`, 20, 3600))) return { error: "Muitas transferências em pouco tempo. Tente de novo em uma hora." };
  const token = randomBytes(24).toString("hex");
  const [tr] = await db.insert(ticketTransfers).values({ ticketId: t.id, fromUserId: user.id, toEmail: parsed.data.email.toLowerCase(), token, status: "pending" }).returning({ id: ticketTransfers.id });
  await db.update(tickets).set({ status: "transferred", secret: randomBytes(16).toString("hex") }).where(eq(tickets.id, t.id));
  after(() => mailTransferSent(tr.id));
  revalidatePath("/meus-ingressos");
  return { ok: true };
}

/** Quem enviou desfaz a transferência enquanto ninguém aceitou: o ingresso volta com um QR novo. */
export async function cancelTransfer(ticketId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Faça login de novo." };
  const t = await db.query.tickets.findFirst({ where: and(eq(tickets.id, ticketId), eq(tickets.holderUserId, user.id), eq(tickets.status, "transferred")), columns: { id: true } });
  if (!t) return { ok: false, error: "Esta transferência não pode mais ser cancelada." };
  const [tr] = await db.update(ticketTransfers).set({ status: "cancelled" })
    .where(and(eq(ticketTransfers.ticketId, t.id), eq(ticketTransfers.fromUserId, user.id), eq(ticketTransfers.status, "pending"))).returning({ id: ticketTransfers.id });
  if (!tr) return { ok: false, error: "A pessoa já aceitou o ingresso." };
  await db.update(tickets).set({ status: "valid", secret: randomBytes(16).toString("hex") }).where(eq(tickets.id, t.id));
  after(() => mailTransferCancelled(tr.id));
  revalidatePath("/meus-ingressos");
  return { ok: true };
}

export type AcceptResult = { ok: true; code: string } | { ok: false; error: string; login?: boolean; verify?: boolean };

/**
 * Quem recebeu aceita pelo link do e-mail: o ingresso vai para a conta logada, com QR e código novos (o link vale
 * uma vez; quem enviou conhecia o código antigo e não entra mais com ele).
 * Ingresso de outra pessoa enviado na compra (kind "gift"): só a conta do e-mail informado no pedido pode receber
 * (o link só chega nesse e-mail, então quem o abre comprovou a caixa de entrada); o titular continua o nome
 * informado na compra.
 */
export async function acceptTransfer(token: string): Promise<AcceptResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre ou crie sua conta para aceitar.", login: true };
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "Link de transferência inválido." };
  const tr = await db.query.ticketTransfers.findFirst({ where: eq(ticketTransfers.token, token) });
  if (!tr || tr.status === "cancelled" || tr.status === "expired") return { ok: false, error: tr?.kind === "gift" ? "Quem comprou cancelou o envio deste ingresso." : "Esta transferência foi cancelada por quem enviou." };
  if (tr.status === "accepted") {
    const t = await db.query.tickets.findFirst({ where: eq(tickets.id, tr.ticketId), columns: { code: true, holderUserId: true } });
    return t && t.holderUserId === user.id ? { ok: true, code: t.code } : { ok: false, error: "Este ingresso já foi aceito por outra conta." };
  }
  if (tr.fromUserId === user.id) return { ok: false, error: "Você enviou este ingresso. Entre com a conta de quem vai receber." };
  const gift = tr.kind === "gift";
  if (gift) {
    if ((user.email ?? "").trim().toLowerCase() !== tr.toEmail.toLowerCase()) return { ok: false, error: `Este ingresso foi enviado para ${tr.toEmail}. Entre com a conta desse e-mail para receber.` };
    // passa pelo cadastro normal: a conta precisa estar ativada (código do e-mail) antes de receber
    if (!user.emailVerified) return { ok: false, error: "Ative sua conta com o código que enviamos por e-mail para receber o ingresso.", verify: true };
  }
  const [claimed] = await db.update(ticketTransfers).set({ status: "accepted", toUserId: user.id, acceptedAt: new Date() })
    .where(and(eq(ticketTransfers.id, tr.id), eq(ticketTransfers.status, "pending"))).returning({ id: ticketTransfers.id });
  if (!claimed) return { ok: false, error: "Esta transferência não está mais disponível." };
  const [t] = await db.update(tickets)
    .set({ holderUserId: user.id, ...(gift ? {} : { holderName: user.name || null }), status: "valid", code: ticketCode(), secret: randomBytes(16).toString("hex") })
    .where(and(eq(tickets.id, tr.ticketId), eq(tickets.holderUserId, tr.fromUserId), eq(tickets.status, "transferred")))
    .returning({ code: tickets.code });
  if (!t) {
    await db.update(ticketTransfers).set({ status: "cancelled" }).where(eq(ticketTransfers.id, tr.id));
    return { ok: false, error: "Este ingresso não pode mais ser transferido." };
  }
  await db.insert(schema.userProfiles).values({ userId: user.id, name: user.name ?? null, email: user.email }).onConflictDoNothing();
  after(() => mailTransferAccepted(tr.id));
  revalidatePath("/meus-ingressos");
  return { ok: true, code: t.code };
}

/** Quem enviou manda o e-mail de novo para quem ainda não aceitou (no máximo um por minuto). */
export async function resendTransfer(transferId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Faça login de novo." };
  if (!z.string().uuid().safeParse(transferId).success) return { ok: false, error: "Envio não encontrado." };
  const [tr] = await db.update(ticketTransfers).set({ updatedAt: new Date() })
    .where(and(
      eq(ticketTransfers.id, transferId), eq(ticketTransfers.fromUserId, user.id), eq(ticketTransfers.status, "pending"),
      lt(ticketTransfers.updatedAt, new Date(Date.now() - 60_000)),
    ))
    .returning({ id: ticketTransfers.id });
  if (!tr) {
    const cur = await db.query.ticketTransfers.findFirst({ where: and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.fromUserId, user.id)), columns: { status: true } });
    if (!cur) return { ok: false, error: "Envio não encontrado." };
    return { ok: false, error: cur.status === "pending" ? "Acabamos de enviar. Espere um minuto para reenviar." : cur.status === "accepted" ? "A pessoa já recebeu o ingresso." : "Este envio foi cancelado." };
  }
  after(() => mailTransferSent(tr.id, true));
  return { ok: true };
}
