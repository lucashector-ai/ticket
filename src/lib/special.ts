import "server-only";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deadlineOpen } from "@/lib/refund-policy";

/*
 * Compras "especiais" que passam pelo mesmo checkout, com 1 ingresso travado:
 *   grupo    a parte de uma compra em grupo (a vaga já está segurada)
 *   revenda  um ingresso anunciado na revenda oficial (o ingresso já existe; troca de dono)
 */
export type Special =
  | { kind: "grupo"; shareId: string; groupId: string; groupCode: string; ticketTypeId: string; priceCents: number; slot: number; slots: number }
  | { kind: "revenda"; listingId: string; ticketId: string; ticketTypeId: string; priceCents: number; sellerUserId: string };

const HOLD_MS = 15 * 60_000;
const { groupShares, resaleListings } = schema;

/*
 * Compra em grupo × limite por pessoa (decisão do dono, D-01): as partes do grupo não contam para o limite
 * por pessoa, então cada conta paga no máximo UMA parte de cada grupo (e tem no máximo um grupo aberto por
 * evento, em createGroup). Conferido aqui (antes de segurar a vaga) e de novo na emissão, dentro da transação.
 */
export const ONE_SHARE = "Você já pagou uma parte deste grupo. Cada pessoa paga só a própria parte.";

/** Esta conta já pagou alguma parte deste grupo? */
export async function paidShareInGroup(groupId: string, userId: string) {
  const r = await db.select({ id: groupShares.id }).from(groupShares)
    .where(and(eq(groupShares.groupId, groupId), eq(groupShares.userId, userId), sql`${groupShares.paidAt} is not null`)).limit(1);
  return r.length > 0;
}

/** Confere se a parte do grupo / o anúncio ainda pode ser comprado por este usuário (sem reservar). */
export async function lookupSpecial(eventId: string, ref: { groupShareId?: string | null; resaleListingId?: string | null }, userId: string | null): Promise<{ ok: true; s: Special } | { ok: false; error: string }> {
  const now = new Date();
  if (ref.groupShareId) {
    const share = await db.query.groupShares.findFirst({ where: eq(groupShares.id, ref.groupShareId), with: { group: { with: { shares: { columns: { id: true, sortOrder: true } } } } } });
    if (!share || share.group.eventId !== eventId) return { ok: false, error: "Esta parte do grupo não existe." };
    if (share.paidAt) return { ok: false, error: "Esta parte do grupo já foi paga." };
    if (userId && (await paidShareInGroup(share.groupId, userId))) return { ok: false, error: ONE_SHARE };
    if (share.group.status !== "open" || share.group.expiresAt < now) return { ok: false, error: "O tempo deste grupo acabou e as vagas não pagas voltaram para a venda." };
    if (share.userId && share.userId !== userId && share.claimedAt && now.getTime() - share.claimedAt.getTime() < HOLD_MS) return { ok: false, error: "Outra pessoa do grupo está pagando esta parte agora. Escolha outra vaga." };
    const order = [...share.group.shares].sort((a, b) => a.sortOrder - b.sortOrder);
    return { ok: true, s: { kind: "grupo", shareId: share.id, groupId: share.groupId, groupCode: share.group.code, ticketTypeId: share.ticketTypeId, priceCents: share.priceCents, slot: order.findIndex((x) => x.id === share.id) + 1, slots: order.length } };
  }
  if (ref.resaleListingId) {
    const l = await db.query.resaleListings.findFirst({ where: eq(resaleListings.id, ref.resaleListingId), with: { ticket: { columns: { status: true, holderUserId: true } }, event: { columns: { startAt: true, resaleUntilHours: true } } } });
    if (!l || l.eventId !== eventId) return { ok: false, error: "Anúncio não encontrado." };
    // prazo da revenda definido pelo produtor (até X horas antes do início)
    if (!deadlineOpen(l.event.startAt, l.event.resaleUntilHours, now)) return { ok: false, error: "O prazo da revenda deste evento acabou." };
    if (l.sellerUserId === userId) return { ok: false, error: "Este anúncio é seu." };
    if (l.status === "sold" || l.status === "cancelled" || l.ticket.status !== "valid" || l.ticket.holderUserId !== l.sellerUserId) return { ok: false, error: "Este ingresso não está mais à venda." };
    if (l.status === "reserved" && l.reservedBy !== userId && l.reservedUntil && l.reservedUntil > now) return { ok: false, error: "Alguém está comprando este ingresso agora. Tente outro anúncio ou volte em alguns minutos." };
    return { ok: true, s: { kind: "revenda", listingId: l.id, ticketId: l.ticketId, ticketTypeId: l.ticketTypeId, priceCents: l.priceCents, sellerUserId: l.sellerUserId } };
  }
  return { ok: false, error: "Compra inválida." };
}

/** Segura a parte / o anúncio para o usuário enquanto ele paga (15 min). */
export async function claimSpecial(s: Special, userId: string, name: string) {
  const now = new Date(), stale = new Date(now.getTime() - HOLD_MS);
  if (s.kind === "grupo") {
    const r = await db.update(groupShares).set({ userId, name, claimedAt: now })
      .where(and(
        eq(groupShares.id, s.shareId), isNull(groupShares.paidAt), or(isNull(groupShares.userId), eq(groupShares.userId, userId), lt(groupShares.claimedAt, stale)),
        // uma parte por conta: nenhuma outra parte deste grupo paga por ela
        sql`not exists (select 1 from ${groupShares} o where o.group_id = ${s.groupId} and o.user_id = ${userId} and o.paid_at is not null)`,
      ))
      .returning({ id: groupShares.id });
    // trocou de vaga: a que ela segurava antes (e não pagou) volta a ficar livre para o grupo
    if (r.length) {
      await db.update(groupShares).set({ userId: null, name: null, claimedAt: null })
        .where(and(eq(groupShares.groupId, s.groupId), eq(groupShares.userId, userId), isNull(groupShares.paidAt), ne(groupShares.id, s.shareId)));
    }
    return r.length > 0;
  }
  const r = await db.update(resaleListings).set({ status: "reserved", reservedBy: userId, reservedUntil: new Date(now.getTime() + HOLD_MS) })
    .where(and(eq(resaleListings.id, s.listingId), ne(resaleListings.sellerUserId, userId),
      or(eq(resaleListings.status, "active"), and(eq(resaleListings.status, "reserved"), or(eq(resaleListings.reservedBy, userId), lt(resaleListings.reservedUntil, now))))))
    .returning({ id: resaleListings.id });
  return r.length > 0;
}

