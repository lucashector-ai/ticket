import "server-only";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { groupShares: s, groupOrders: g } = schema;

/** Vagas seguradas por compras em grupo ainda abertas (partes não pagas), por tipo de ingresso. */
export async function heldByType(eventId: string, exceptShareId?: string | null): Promise<Map<string, number>> {
  const rows = await db
    .select({ type: s.ticketTypeId, n: sql<number>`count(*)::int` })
    .from(s)
    .innerJoin(g, eq(g.id, s.groupId))
    .where(and(eq(g.eventId, eventId), eq(g.status, "open"), gt(g.expiresAt, new Date()), isNull(s.paidAt), ...(exceptShareId ? [ne(s.id, exceptShareId)] : [])))
    .groupBy(s.ticketTypeId);
  return new Map(rows.map((r) => [r.type, r.n]));
}

/** Subconsulta SQL das vagas seguradas de um tipo (para a baixa atômica do estoque no pagamento). */
export const heldSql = (ticketTypeId: unknown, exceptShareId?: string | null) => sql`(
  select count(*) from ${s} join ${g} on ${g.id} = ${s.groupId}
  where ${s.ticketTypeId} = ${ticketTypeId} and ${g.status} = 'open' and ${g.expiresAt} > now() and ${s.paidAt} is null
  ${exceptShareId ? sql`and ${s.id} <> ${exceptShareId}` : sql``}
)`;
