import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { ticketTransfers: tt, tickets, ticketTypes, events } = schema;

/** evento ainda não acabou (com um dia de folga) */
const notOver = sql`coalesce(${events.endAt}, ${events.startAt}) > now() - interval '1 day'`;

const cols = {
  id: tt.id, ticketId: tt.ticketId, toEmail: tt.toEmail, status: tt.status, kind: tt.kind, token: tt.token,
  code: tickets.code, holderName: tickets.holderName, halfPrice: tickets.halfPrice, tier: ticketTypes.name,
  eventTitle: events.title, eventSlug: events.slug, flyerId: events.flyerId, startAt: events.startAt, dateLabel: events.dateLabel,
};

/**
 * Ingressos que o usuário mandou para outras pessoas (na compra ou por Transferir), de eventos que não acabaram:
 * os que esperam a pessoa aceitar (dá para reenviar ou cancelar) e os já recebidos.
 */
export async function listSentTransfers(userId: string) {
  return db.select(cols).from(tt)
    .innerJoin(tickets, eq(tickets.id, tt.ticketId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(and(eq(tt.fromUserId, userId), inArray(tt.status, ["pending", "accepted"]), notOver))
    .orderBy(desc(tt.createdAt))
    .limit(60);
}

/** Ingressos enviados para o e-mail da conta (confirmado) que ainda esperam a pessoa aceitar. */
export async function listIncomingTransfers(email: string | null | undefined, verified: boolean) {
  if (!email || !verified) return [];
  return db.select(cols).from(tt)
    .innerJoin(tickets, eq(tickets.id, tt.ticketId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(and(sql`lower(${tt.toEmail}) = lower(${email})`, eq(tt.status, "pending"), eq(tickets.status, "transferred"), notOver))
    .orderBy(desc(tt.createdAt))
    .limit(30);
}
