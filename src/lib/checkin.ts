import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/actions/tickets";
import { getTicketByCode } from "@/lib/data/ingressos";

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
 */
export async function checkinTicket(input: string, eventIds: Set<string> | null): Promise<CheckinResult> {
  const raw = input.trim();
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
  // só marca se ainda estiver válido: duas leituras ao mesmo tempo não passam as duas
  const now = new Date();
  const done = await db.update(schema.tickets).set({ status: "used", checkedInAt: now })
    .where(and(eq(schema.tickets.id, ticket.id), eq(schema.tickets.status, "valid"))).returning({ id: schema.tickets.id });
  if (!done.length) return { ok: false, status: 409, error: "Ingresso já utilizado.", ticket: info };
  // entrou no evento: sai da revenda
  await db.update(schema.resaleListings).set({ status: "cancelled" })
    .where(and(eq(schema.resaleListings.ticketId, ticket.id), inArray(schema.resaleListings.status, ["active", "reserved"])));
  return { ok: true, status: 200, checkedInAt: now, ticket: info };
}

/** Link externo de check-in ainda ligado (não revogado e o evento não acabou há mais de um dia). */
export async function activeCheckinLink(token: string) {
  if (!/^[A-Za-z0-9_-]{16,48}$/.test(token)) return null;
  const link = await db.query.checkinLinks.findFirst({
    where: and(eq(schema.checkinLinks.token, token), isNull(schema.checkinLinks.revokedAt)),
    with: { event: { columns: { id: true, title: true, slug: true, flyerId: true, status: true, startAt: true, endAt: true, dateLabel: true } } },
  });
  if (!link || link.event.status === "draft") return null;
  const end = (link.event.endAt ?? link.event.startAt).getTime();
  return end + 86_400_000 < Date.now() ? null : link;
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
