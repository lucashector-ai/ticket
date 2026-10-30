import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { MEIA_SHARE, meiaCap } from "@/lib/meia-share";

/*
 * Cota de meia-entrada por setor (decisão do dono: 40% por setor; em evento de várias datas, por setor e data).
 * Lugares do setor = soma das quantidades de todos os tipos do mesmo setor e da mesma data. Contam como meia: os
 * ingressos de tipo Meia e os de Inteira com a caixa "Meia-entrada" marcada, vendidos (válidos, usados ou em
 * transferência) e, na reserva, também os pedidos pendentes dentro dos 15 minutos.
 * Conferida no servidor com uma trava por setor e data, na mesma transação da reserva (placeOrder) e da emissão
 * (fulfill): dois pedidos ao mesmo tempo pela última meia não passam os dois.
 */

export { MEIA_SHARE };
export const MEIA_SOLD_OUT = "A meia-entrada deste setor esgotou. A inteira continua disponível.";

const { tickets, ticketTypes, orders, orderItems } = schema;

/** Setor e data de um tipo (a chave da cota). */
export type MeiaGroup = { sector: string | null; sessionId: string | null };
type TypeLike = MeiaGroup & { id: string; kind: string | null; quantity: number };

export const groupKey = (g: MeiaGroup) => `${g.sector ?? ""}|${g.sessionId ?? ""}`;
/** Chave da trava (junto com as do estoque, numa chamada só: a ordem fixa evita impasse). */
export const meiaLockKey = (eventId: string, g: MeiaGroup) => `meia:${eventId}:${groupKey(g)}`;

/** Quantas meias cada linha do pedido usa, por setor e data. */
export function meiaInOrder(types: readonly TypeLike[], lines: { ticketTypeId: string; quantity: number }[], holders: { ticketTypeId: string; meia: boolean }[]) {
  const byId = new Map(types.map((t) => [t.id, t]));
  const out = new Map<string, { group: MeiaGroup; n: number }>();
  const add = (t: TypeLike | undefined, n: number) => {
    if (!t || n <= 0) return;
    const k = groupKey(t);
    out.set(k, { group: { sector: t.sector, sessionId: t.sessionId }, n: (out.get(k)?.n ?? 0) + n });
  };
  for (const l of lines) { const t = byId.get(l.ticketTypeId); if (t?.kind === "meia") add(t, l.quantity); }
  for (const h of holders) { const t = byId.get(h.ticketTypeId); if (h.meia && t && t.kind !== "meia") add(t, 1); }
  return out;
}

const sameGroup = (alias: SQL, g: MeiaGroup) =>
  sql`${alias}.sector is not distinct from ${g.sector} and ${alias}.session_id is not distinct from ${g.sessionId ? sql`${g.sessionId}::uuid` : sql`null::uuid`}`;

/** Lugares do setor e data (soma das quantidades dos tipos). */
const capacitySql = (eventId: string, g: MeiaGroup) =>
  sql`(select coalesce(sum(y.quantity), 0) from ${ticketTypes} y where y.event_id = ${eventId} and ${sameGroup(sql`y`, g)})`;

/** Meias vendidas no setor e data. */
const soldSql = (eventId: string, g: MeiaGroup) => sql`(
  select count(*) from ${tickets} t join ${ticketTypes} y on y.id = t.ticket_type_id
  where y.event_id = ${eventId} and ${sameGroup(sql`y`, g)} and t.status in ('valid', 'used', 'transferred') and (y.kind = 'meia' or t.half_price)
)`;

/** Meias seguradas por pedidos pendentes dentro da reserva (tipo Meia + caixa marcada na Inteira). */
const heldSql = (eventId: string, g: MeiaGroup) => sql`(
  select coalesce(sum(
    coalesce((select sum(i.quantity) from ${orderItems} i join ${ticketTypes} y on y.id = i.ticket_type_id
      where i.order_id = p.id and y.kind = 'meia' and ${sameGroup(sql`y`, g)}), 0)
    + (select count(*) from jsonb_array_elements(coalesce(p.holders, '[]'::jsonb)) h join ${ticketTypes} y on y.id::text = h->>'ticketTypeId'
      where coalesce((h->>'meia')::boolean, false) and y.kind is distinct from 'meia' and ${sameGroup(sql`y`, g)})
  ), 0)
  from ${orders} p
  where p.event_id = ${eventId} and p.status = 'pending' and p.expires_at > now() and p.group_share_id is null and p.resale_listing_id is null
)`;

/** Condição para um `ensure` da reserva: vendidas + reservadas (o pedido recém-gravado incluído) dentro da cota. */
export const meiaQuotaOkSql = (eventId: string, groups: MeiaGroup[]) => sql`${sql.join(groups.map((g) => sql`(
  ${soldSql(eventId, g)} + ${heldSql(eventId, g)}
) <= floor(${capacitySql(eventId, g)} * ${MEIA_SHARE}::numeric + 0.000000001)`), sql` and `)}`;

/** Condição para o `ensure` da emissão: vendidas (este pedido incluído) dentro da cota. Quem pagou tem prioridade sobre reservas. */
export const meiaQuotaPaidOkSql = (eventId: string, groups: MeiaGroup[]) =>
  sql`${sql.join(groups.map((g) => sql`${soldSql(eventId, g)} <= floor(${capacitySql(eventId, g)} * ${MEIA_SHARE}::numeric + 0.000000001)`), sql` and `)}`;

/** Meias que ainda cabem em cada setor e data do evento (para a tela; a conferência que vale é a da transação). */
export async function meiaLeftByGroup(eventId: string, types: readonly TypeLike[]): Promise<Map<string, number>> {
  // só setores onde existe meia (tipo Meia ou Inteira paga, que pode ter a caixa)
  const groups = new Map<string, MeiaGroup>();
  for (const t of types) if (t.kind === "meia" || ((!t.kind || t.kind === "inteira") && t.quantity > 0)) groups.set(groupKey(t), { sector: t.sector, sessionId: t.sessionId });
  const rows = await Promise.all([...groups].map(async ([k, g]) => {
    const cap = meiaCap(types.filter((t) => groupKey(t) === k).reduce((s, t) => s + t.quantity, 0));
    const r = await db.execute<{ n: number }>(sql`select (${soldSql(eventId, g)} + ${heldSql(eventId, g)})::int as n`);
    return [k, Math.max(0, cap - Number(r.rows[0]?.n ?? 0))] as const;
  }));
  return new Map(rows);
}
