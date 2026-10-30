"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { emailConfirmed } from "@/lib/auth/verified";
import { hideEmail } from "@/lib/format";
import { mailTransferAccepted, mailTransferCancelled, mailTransferSent } from "@/lib/notify";
import { deadlineLabel, deadlineOpen } from "@/lib/refund-policy";
import { ticketCode } from "@/lib/tickets/code";
import { allowHit } from "@/lib/rate-limit";
import { abortOf, ensure, runBatch } from "@/lib/payments/tx";
import { trailInsert } from "@/lib/tickets/trail";

const { tickets, ticketTransfers, ticketEvents } = schema;

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
  const tr = { id: randomUUID() };
  const toEmail = parsed.data.email.toLowerCase();
  // numa transação: o ingresso trava (só se ainda for desta conta e válido: dois envios ao mesmo tempo não abrem
  // dois links), o link nasce e o rastro registra o envio (D-12)
  try {
    await runBatch([
      ensure(sql`(select count(*) from u) = 1`, "ticket", sql`with u as (
        update ${tickets} set status = 'transferred', secret = ${randomBytes(16).toString("hex")}, updated_at = now()
        where id = ${t.id} and holder_user_id = ${user.id} and status = 'valid' returning 1)`),
      db.insert(ticketTransfers).values({ id: tr.id, ticketId: t.id, fromUserId: user.id, toEmail, token, status: "pending" }),
      trailInsert([{ ticketId: t.id, kind: "transferencia_enviada", code: t.code, fromUserId: user.id, toEmail, holderName: t.holderName, refId: tr.id }]),
    ]);
  } catch (e) {
    if (abortOf(e) === "ticket") return { error: "Este ingresso não pode ser transferido." };
    throw e;
  }
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
  // um comando só (uma transação): o link deixa de valer, o ingresso volta com QR novo e o rastro registra (D-12)
  const r = await db.execute<{ id: string }>(sql`
    with tr as (
      update ${ticketTransfers} set status = 'cancelled', updated_at = now()
      where ticket_id = ${t.id} and from_user_id = ${user.id} and status = 'pending' returning id, ticket_id, to_email
    ), tk as (
      update ${tickets} set status = 'valid', secret = ${randomBytes(16).toString("hex")}, updated_at = now()
      where id in (select ticket_id from tr) and status = 'transferred' returning id, code, holder_name
    ), ev as (
      insert into ${ticketEvents} (ticket_id, kind, code, from_user_id, to_email, holder_name, ref_id)
      select tk.id, 'transferencia_cancelada', tk.code, ${user.id}, tr.to_email, tk.holder_name, tr.id from tr join tk on tk.id = tr.ticket_id
      returning 1
    )
    select id from tr`);
  const tr = r.rows[0];
  if (!tr) return { ok: false, error: "A pessoa já aceitou o ingresso." };
  after(() => mailTransferCancelled(tr.id));
  revalidatePath("/meus-ingressos");
  return { ok: true };
}

/** `other`: a conta logada não é a do e-mail para onde o ingresso foi enviado. */
export type AcceptResult = { ok: true; code: string } | { ok: false; error: string; login?: boolean; verify?: boolean; other?: boolean };

/**
 * Quem recebeu aceita pelo link do e-mail: o ingresso vai para a conta com QR e código novos (o link vale uma vez;
 * quem enviou conhecia o código antigo e não entra mais com ele).
 * Só a conta do e-mail para onde o ingresso foi enviado recebe, com o e-mail confirmado (D-11): vale para a
 * transferência (Meus ingressos → Transferir) e para o ingresso de outra pessoa enviado na compra (kind "gift").
 * No envio da compra o titular continua o nome informado no pedido; na transferência passa a ser quem recebeu.
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
  // o ingresso é de quem tem o e-mail para onde ele foi enviado (D-11), no envio da compra e na transferência:
  // link encaminhado ou aberto em outra conta não leva o ingresso
  if ((user.email ?? "").trim().toLowerCase() !== tr.toEmail.trim().toLowerCase()) {
    return { ok: false, error: `Este ingresso foi enviado para ${hideEmail(tr.toEmail)}. Entre com esse e-mail para receber.`, other: true };
  }
  // conta criada com o e-mail de outra pessoa não comprova a caixa de entrada: precisa do código da ativação
  if (!(await emailConfirmed(user))) return { ok: false, error: "Ative sua conta com o código que enviamos por e-mail para receber o ingresso.", verify: true };
  // um comando só (uma transação): o ingresso muda de dono com código e QR novos, o link vira "aceito" e o rastro
  // registra de quem para quem, com o código anterior (lido antes da troca, no mesmo comando). Dois aceites ao mesmo
  // tempo: o segundo não acha mais o ingresso "transferred" e não muda nada.
  const code = ticketCode();
  const r = await db.execute<{ code: string }>(sql`
    with tk as (
      update ${tickets} set holder_user_id = ${user.id}, holder_name = ${gift ? sql`holder_name` : sql`${user.name || null}`},
        status = 'valid', code = ${code}, secret = ${randomBytes(16).toString("hex")}, updated_at = now()
      where id = ${tr.ticketId} and holder_user_id = ${tr.fromUserId} and status = 'transferred'
        and exists (select 1 from ${ticketTransfers} where id = ${tr.id} and status = 'pending')
      returning id, code, holder_name
    ), c as (
      update ${ticketTransfers} set status = 'accepted', to_user_id = ${user.id}, accepted_at = now(), updated_at = now()
      where id = ${tr.id} and status = 'pending' and exists (select 1 from tk) returning 1
    ), ev as (
      insert into ${ticketEvents} (ticket_id, kind, code, prev_code, from_user_id, to_user_id, to_email, holder_name, ref_id)
      select tk.id, ${gift ? "presente_aceito" : "transferencia_aceita"}, tk.code, (select code from ${tickets} where id = ${tr.ticketId}),
        ${tr.fromUserId}, ${user.id}, ${tr.toEmail}, tk.holder_name, ${tr.id}
      from tk returning 1
    )
    select code from tk`);
  const t = r.rows[0];
  if (!t) {
    const now = await db.query.ticketTransfers.findFirst({ where: eq(ticketTransfers.id, tr.id), columns: { status: true } });
    if (now?.status !== "pending") return { ok: false, error: "Esta transferência não está mais disponível." };
    // o ingresso não está mais esperando este envio (reembolsado, cancelado): o link deixa de valer
    await db.update(ticketTransfers).set({ status: "cancelled" }).where(and(eq(ticketTransfers.id, tr.id), eq(ticketTransfers.status, "pending")));
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
  // o reenvio também entra no rastro (D-12), no mesmo comando
  const r = await db.execute<{ id: string }>(sql`
    with tr as (
      update ${ticketTransfers} set updated_at = now()
      where id = ${transferId} and from_user_id = ${user.id} and status = 'pending' and updated_at < ${new Date(Date.now() - 60_000)}
      returning id, ticket_id, to_email, kind
    ), ev as (
      insert into ${ticketEvents} (ticket_id, kind, code, from_user_id, to_email, holder_name, ref_id, note)
      select tr.ticket_id, 'transferencia_reenviada', t.code, ${user.id}, tr.to_email, t.holder_name, tr.id, case when tr.kind = 'gift' then 'Envio da compra' end
      from tr join ${tickets} t on t.id = tr.ticket_id returning 1
    )
    select id from tr`);
  const tr = r.rows[0];
  if (!tr) {
    const cur = await db.query.ticketTransfers.findFirst({ where: and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.fromUserId, user.id)), columns: { status: true } });
    if (!cur) return { ok: false, error: "Envio não encontrado." };
    return { ok: false, error: cur.status === "pending" ? "Acabamos de enviar. Espere um minuto para reenviar." : cur.status === "accepted" ? "A pessoa já recebeu o ingresso." : "Este envio foi cancelado." };
  }
  after(() => mailTransferSent(tr.id, true));
  return { ok: true };
}
