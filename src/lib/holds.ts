import "server-only";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { groupShares: s, groupOrders: g, orders: o, orderItems: oi, ticketTypes: tt } = schema;

/*
 * Vagas seguradas, por tipo de ingresso:
 *   - compras em grupo abertas (partes ainda não pagas);
 *   - pedidos pendentes dentro dos 15 min da reserva (o checkout mostra "reserva" com cronômetro: enquanto
 *     ela vale, ninguém mais leva aquele lugar). Pedidos de parte de grupo e de revenda não entram (a vaga
 *     do grupo já conta acima; a revenda não usa o estoque).
 * Quem já pagou de verdade tem prioridade: a baixa do estoque na confirmação (heldSql) não desconta as
 * reservas de pedidos não pagos, só as vagas dos grupos.
 */
export async function heldByType(eventId: string, opts: { exceptShareId?: string | null; exceptUserId?: string | null } = {}): Promise<Map<string, number>> {
  const now = new Date();
  const [groups, pending] = await Promise.all([
    db.select({ type: s.ticketTypeId, n: sql<number>`count(*)::int` })
      .from(s)
      .innerJoin(g, eq(g.id, s.groupId))
      .where(and(eq(g.eventId, eventId), eq(g.status, "open"), gt(g.expiresAt, now), isNull(s.paidAt), ...(opts.exceptShareId ? [ne(s.id, opts.exceptShareId)] : [])))
      .groupBy(s.ticketTypeId),
    db.select({ type: oi.ticketTypeId, n: sql<number>`coalesce(sum(${oi.quantity}), 0)::int` })
      .from(oi)
      .innerJoin(o, eq(o.id, oi.orderId))
      .where(and(
        eq(o.eventId, eventId), eq(o.status, "pending"), gt(o.expiresAt, now), isNull(o.groupShareId), isNull(o.resaleListingId),
        // os pedidos abertos da própria pessoa são liberados quando ela faz um novo (releaseOthers)
        ...(opts.exceptUserId ? [ne(o.userId, opts.exceptUserId)] : []),
      ))
      .groupBy(oi.ticketTypeId),
  ]);
  const out = new Map<string, number>();
  for (const r of [...groups, ...pending]) out.set(r.type, (out.get(r.type) ?? 0) + Number(r.n));
  return out;
}

/**
 * Tipos em que vendidos + segurados passaram da quantidade. Usado logo depois de gravar um pedido: dois
 * pedidos ao mesmo tempo pelo último lugar passam juntos pela conferência (sem transação no driver HTTP).
 */
export async function overbooked(eventId: string, typeIds: string[]): Promise<string[]> {
  if (!typeIds.length) return [];
  const [types, held] = await Promise.all([
    db.select({ id: tt.id, quantity: tt.quantity, sold: tt.sold }).from(tt).where(inArray(tt.id, typeIds)),
    heldByType(eventId),
  ]);
  return types.filter((t) => t.sold + (held.get(t.id) ?? 0) > t.quantity).map((t) => t.id);
}

/** Subconsulta SQL das vagas seguradas por grupos de um tipo (para a baixa atômica do estoque no pagamento). */
export const heldSql = (ticketTypeId: unknown, exceptShareId?: string | null) => sql`(
  select count(*) from ${s} join ${g} on ${g.id} = ${s.groupId}
  where ${s.ticketTypeId} = ${ticketTypeId} and ${g.status} = 'open' and ${g.expiresAt} > now() and ${s.paidAt} is null
  ${exceptShareId ? sql`and ${s.id} <> ${exceptShareId}` : sql``}
)`;
