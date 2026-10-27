import "server-only";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/*
 * Compras "especiais" que passam pelo mesmo checkout, com 1 ingresso travado:
 *   grupo    a parte de uma compra em grupo (a vaga já está segurada)
 *   revenda  um ingresso anunciado na revenda oficial (o ingresso já existe; troca de dono)
 */
export type Special =
  | { kind: "grupo"; shareId: string; groupId: string; groupCode: string; ticketTypeId: string; priceCents: number; slot: number; slots: number }
  | { kind: "revenda"; listingId: string; ticketId: string; ticketTypeId: string; priceCents: number; sellerUserId: string };

const HOLD_MS = 15 * 60_000;
const { groupShares, groupOrders, resaleListings } = schema;

/** Confere se a parte do grupo / o anúncio ainda pode ser comprado por este usuário (sem reservar). */
export async function lookupSpecial(eventId: string, ref: { groupShareId?: string | null; resaleListingId?: string | null }, userId: string | null): Promise<{ ok: true; s: Special } | { ok: false; error: string }> {
  const now = new Date();
  if (ref.groupShareId) {
    const share = await db.query.groupShares.findFirst({ where: eq(groupShares.id, ref.groupShareId), with: { group: { with: { shares: { columns: { id: true, sortOrder: true } } } } } });
    if (!share || share.group.eventId !== eventId) return { ok: false, error: "Esta parte do grupo não existe." };
    if (share.paidAt) return { ok: false, error: "Esta parte do grupo já foi paga." };
    if (share.group.status !== "open" || share.group.expiresAt < now) return { ok: false, error: "O tempo deste grupo acabou e as vagas não pagas voltaram para a venda." };
    if (share.userId && share.userId !== userId && share.claimedAt && now.getTime() - share.claimedAt.getTime() < HOLD_MS) return { ok: false, error: "Outra pessoa do grupo está pagando esta parte agora. Escolha outra vaga." };
    const order = [...share.group.shares].sort((a, b) => a.sortOrder - b.sortOrder);
    return { ok: true, s: { kind: "grupo", shareId: share.id, groupId: share.groupId, groupCode: share.group.code, ticketTypeId: share.ticketTypeId, priceCents: share.priceCents, slot: order.findIndex((x) => x.id === share.id) + 1, slots: order.length } };
  }
  if (ref.resaleListingId) {
    const l = await db.query.resaleListings.findFirst({ where: eq(resaleListings.id, ref.resaleListingId), with: { ticket: { columns: { status: true, holderUserId: true } } } });
    if (!l || l.eventId !== eventId) return { ok: false, error: "Anúncio não encontrado." };
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
      .where(and(eq(groupShares.id, s.shareId), isNull(groupShares.paidAt), or(isNull(groupShares.userId), eq(groupShares.userId, userId), lt(groupShares.claimedAt, stale))))
      .returning({ id: groupShares.id });
    return r.length > 0;
  }
  const r = await db.update(resaleListings).set({ status: "reserved", reservedBy: userId, reservedUntil: new Date(now.getTime() + HOLD_MS) })
    .where(and(eq(resaleListings.id, s.listingId), ne(resaleListings.sellerUserId, userId),
      or(eq(resaleListings.status, "active"), and(eq(resaleListings.status, "reserved"), or(eq(resaleListings.reservedBy, userId), lt(resaleListings.reservedUntil, now))))))
    .returning({ id: resaleListings.id });
  return r.length > 0;
}

/** Depois do pagamento da parte: marca como paga e fecha o grupo quando todos pagaram. */
export async function settleShare(shareId: string, orderId: string) {
  const [sh] = await db.update(groupShares).set({ paidAt: new Date(), orderId }).where(eq(groupShares.id, shareId)).returning({ groupId: groupShares.groupId });
  if (!sh) return;
  const left = await db.select({ n: sql<number>`count(*)::int` }).from(groupShares).where(and(eq(groupShares.groupId, sh.groupId), isNull(groupShares.paidAt)));
  if (!left[0]?.n) await db.update(groupOrders).set({ status: "done" }).where(eq(groupOrders.id, sh.groupId));
}

/** O grupo desta parte ainda segura a vaga? (senão o pagamento disputa o estoque como qualquer compra) */
export async function shareStillHeld(shareId: string) {
  const sh = await db.query.groupShares.findFirst({ where: eq(groupShares.id, shareId), with: { group: { columns: { status: true, expiresAt: true } } } });
  return !!sh && !sh.paidAt && sh.group.status === "open" && sh.group.expiresAt > new Date();
}

