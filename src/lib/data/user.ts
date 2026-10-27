import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

const { favorites, follows, tickets, orders } = schema;

export async function getUserFavoriteSlugs(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const rows = await db.query.favorites.findMany({ where: eq(favorites.userId, userId), with: { event: { columns: { slug: true } } } });
  return rows.map((r) => r.event.slug);
}

export async function isFollowing(userId: string | null | undefined, targetType: "artist" | "organizer", targetId: string) {
  if (!userId) return false;
  const row = await db.query.follows.findFirst({ where: and(eq(follows.userId, userId), eq(follows.targetType, targetType), eq(follows.targetId, targetId)) });
  return !!row;
}

export type TicketWithEvent = Awaited<ReturnType<typeof listUserTickets>>[number];

/** Ingressos do usuário logado, com evento, lote e pedido. */
export async function listUserTickets(userId: string) {
  return db.query.tickets.findMany({
    where: eq(tickets.holderUserId, userId),
    with: {
      event: { with: { venue: { with: { city: true } } } },
      ticketType: true,
      order: true,
    },
    orderBy: [desc(tickets.createdAt)],
  });
}

export async function getOrderForUser(orderId: string, userId: string) {
  const o = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, userId)),
    with: { event: { with: { venue: { with: { city: true } } } }, items: { with: { ticketType: true } }, tickets: true, coupon: true },
  });
  return o ?? null;
}

export async function currentUser() {
  return getSessionUser();
}

/** Spotify conectado (artistas que a pessoa ouve), ou null. */
export async function getSpotifyConnection(userId: string | null | undefined) {
  if (!userId) return null;
  const row = await db.query.spotifyConnections.findFirst({ where: eq(schema.spotifyConnections.userId, userId) });
  return row ?? null;
}

/** Quantas pessoas seguem o artista/produtor no site. */
export async function countFollowers(targetType: "artist" | "organizer", targetId: string) {
  const [row] = await db.select({ n: count() }).from(follows).where(and(eq(follows.targetType, targetType), eq(follows.targetId, targetId)));
  return row?.n ?? 0;
}
