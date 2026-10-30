import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/tickets/qr";
import { getTicketByCode } from "@/lib/data/ingressos";
import { checkinGuest, guestKind, guestTokenFrom } from "@/lib/guest-list";
import { sessionRefusal } from "@/lib/checkin-day";

const PAYLOAD_RE = /^ONDE\|((?:TW|ONDE)-[A-Z0-9]{4}-[A-Z0-9]{4})\|([A-Za-z0-9_-]{16})$/;
const CODE_RE = /^(?:TW|ONDE)-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function same(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type CheckinResult = {
  ok: boolean; status: number; error?: string; checkedInAt?: Date | null;
  ticket?: { code: string; holderName: string | null; event: string; ticketType: string; sector: string | null };
};

/**
 * Check-in de um ingresso: pelo QR assinado ("ONDE|<código>|<assinatura>") ou, digitado pela
 * equipe, só pelo código. `eventIds` = eventos que esta pessoa pode validar (null = qualquer um).
 * O QR do convite da lista free ("LISTA|<token>") também passa por aqui; `by` = quem liberou.
 */
export async function checkinTicket(input: string, eventIds: Set<string> | null, by = "Portaria"): Promise<CheckinResult> {
  const raw = input.trim();
  const guestToken = guestTokenFrom(raw);
  if (guestToken) {
    const r = await checkinGuest({ token: guestToken }, eventIds, by);
    const status = r.ok ? 200 : !r.guest ? 404 : r.checkedInAt ? 409 : 403;
    return {
      ok: r.ok, status, error: r.error, checkedInAt: r.checkedInAt,
      ticket: r.guest ? { code: "LISTA FREE", holderName: r.guest.name, event: r.guest.event, ticketType: guestKind(r.guest.guests), sector: null } : undefined,
    };
  }
  const m = PAYLOAD_RE.exec(raw);
  const code = m ? m[1] : raw.toUpperCase();
  if (!m && !CODE_RE.test(code)) return { ok: false, status: 404, error: "QR code inválido." };

  const ticket = await getTicketByCode(code);
  if (!ticket) return { ok: false, status: 404, error: "Ingresso não encontrado." };
  if (m && !same(await qrPayload(ticket.code, ticket.secret), raw)) return { ok: false, status: 404, error: "QR code inválido ou de um ingresso transferido." };
  if (eventIds && !eventIds.has(ticket.eventId)) return { ok: false, status: 403, error: `Este ingresso é de outro evento (${ticket.event.title}).` };

  const info = { code: ticket.code, holderName: ticket.holderName, event: ticket.event.title, ticketType: ticket.ticketType.name, sector: ticket.ticketType.sector };
  if (ticket.status === "used") return { ok: false, status: 409, error: "Ingresso já utilizado.", checkedInAt: ticket.checkedInAt, ticket: info };
  if (ticket.status !== "valid") {
    const why = ticket.status === "transferred" ? "transferido" : ticket.status === "refunded" ? "reembolsado" : "cancelado";
    return { ok: false, status: 409, error: `Ingresso ${why}.`, ticket: info };
  }
  // evento de várias datas: o ingresso é de uma data (a sessão do tipo) e só entra nela
  if (ticket.ticketType.sessionId) {
    const sessions = await db.select({ id: schema.eventSessions.id, startAt: schema.eventSessions.startAt, doorsAt: schema.eventSessions.doorsAt, sortOrder: schema.eventSessions.sortOrder })
      .from(schema.eventSessions).where(eq(schema.eventSessions.eventId, ticket.eventId));
    const wrong = sessionRefusal(ticket.ticketType.sessionId, sessions, new Date());
    if (wrong) return { ok: false, status: 409, error: wrong, ticket: info };
  }
  // só marca se ainda estiver válido: duas leituras ao mesmo tempo não passam as duas
  // e, no mesmo comando, entrou no evento: sai da revenda (uma ida ao banco a menos em cada leitura da fila)
  const now = new Date();
  const done = await db.execute<{ n: number }>(sql`
    with u as (
      update ${schema.tickets} set status = 'used', checked_in_at = ${now}, updated_at = now() where id = ${ticket.id} and status = 'valid' returning id
    ), r as (
      update ${schema.resaleListings} set status = 'cancelled', updated_at = now() where ticket_id in (select id from u) and status in ('active', 'reserved') returning 1
    )
    select (select count(*) from u)::int as n`);
  if (!done.rows[0]?.n) return { ok: false, status: 409, error: "Ingresso já utilizado.", ticket: info };
  return { ok: true, status: 200, checkedInAt: now, ticket: info };
}

/** Ingressos válidos do evento e quantos já entraram. */
export async function checkinCounts(eventId: string) {
  const t = schema.tickets;
  const [c] = await db.select({
    total: sql<number>`count(*)`,
    inside: sql<number>`count(*) filter (where ${t.checkedInAt} is not null)`,
  }).from(t).where(and(eq(t.eventId, eventId), inArray(t.status, ["valid", "used"])));
  return { total: Number(c?.total ?? 0), inside: Number(c?.inside ?? 0) };
}
