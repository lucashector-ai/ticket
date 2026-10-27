import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listOrganizerEvents, soldPercent } from "@/lib/data/events";

const { organizers, follows, organizerPosts, eventReviews, tickets, events } = schema;

export type ProducerReview = {
  id: string; name: string; rating: number; body: string | null; tags: string[]; reply: string | null;
  eventTitle: string; eventSlug: string; createdAt: Date;
};

/** Tudo da página pública do produtor, mais o que o visitante pode fazer nela. */
export async function getProducerPage(slug: string, viewerId: string | null) {
  const org = await db.query.organizers.findFirst({ where: eq(organizers.slug, slug) });
  if (!org) return null;
  const isOwner = !!viewerId && org.ownerUserId === viewerId;

  const [{ upcoming, past }, [fc], follow, posts, reviewRows] = await Promise.all([
    listOrganizerEvents(org.id),
    db.select({ n: sql<number>`count(*)` }).from(follows).where(and(eq(follows.targetType, "organizer"), eq(follows.targetId, org.id))),
    viewerId ? db.query.follows.findFirst({ where: and(eq(follows.userId, viewerId), eq(follows.targetType, "organizer"), eq(follows.targetId, org.id)) }) : null,
    db.query.organizerPosts.findMany({ where: eq(organizerPosts.organizerId, org.id), orderBy: [desc(organizerPosts.createdAt)], limit: 50 }),
    db.query.eventReviews.findMany({ where: eq(eventReviews.organizerId, org.id), orderBy: [desc(eventReviews.createdAt)], limit: 100, with: { event: { columns: { title: true, slug: true } } } }),
  ]);

  const reviews: ProducerReview[] = reviewRows.map((r) => ({
    id: r.id, name: r.userName ?? "Comprador", rating: r.rating, body: r.body, tags: r.tags ?? [], reply: r.reply,
    eventTitle: r.event.title, eventSlug: r.event.slug, createdAt: r.createdAt,
  }));

  /* eventos passados em que o visitante tinha ingresso e ainda não avaliou */
  let canReview: { id: string; title: string }[] = [];
  if (viewerId && !isOwner) {
    const mine = await db
      .selectDistinct({ id: events.id, title: events.title })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(and(eq(tickets.holderUserId, viewerId), inArray(tickets.status, ["valid", "used"]), eq(events.organizerId, org.id), lt(sql`coalesce(${events.endAt}, ${events.startAt})`, sql`now()`)));
    const done = new Set(reviewRows.filter((r) => r.userId === viewerId).map((r) => r.eventId));
    canReview = mine.filter((e) => !done.has(e.id));
  }

  const next = upcoming[0] ?? null;
  return {
    org, isOwner, upcoming, past, posts, reviews, canReview,
    followers: Number(fc?.n ?? 0),
    following: !!follow, notify: !!follow?.notify,
    nextSold: next ? await soldPercent(next.id) : 0,
  };
}
