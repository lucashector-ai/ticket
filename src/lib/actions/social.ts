"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

const { favorites, follows, events, newsletterSubscribers } = schema;

/** Alterna favorito. Retorna o novo estado. Anônimos usam localStorage no cliente. */
export async function toggleFavorite(eventSlug: string): Promise<{ saved: boolean; auth: boolean }> {
  const user = await getSessionUser();
  if (!user) return { saved: false, auth: false };
  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), columns: { id: true } });
  if (!ev) return { saved: false, auth: true };
  const existing = await db.query.favorites.findFirst({ where: and(eq(favorites.userId, user.id), eq(favorites.eventId, ev.id)) });
  if (existing) {
    await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.eventId, ev.id)));
    return { saved: false, auth: true };
  }
  await db.insert(favorites).values({ userId: user.id, eventId: ev.id }).onConflictDoNothing();
  return { saved: true, auth: true };
}

export async function syncFavorites(slugs: string[]) {
  const user = await getSessionUser();
  if (!user || !slugs.length) return;
  const rows = await db.query.events.findMany({ where: (e, { inArray }) => inArray(e.slug, slugs), columns: { id: true } });
  if (rows.length) await db.insert(favorites).values(rows.map((r) => ({ userId: user.id, eventId: r.id }))).onConflictDoNothing();
}

export async function toggleFollow(targetType: "artist" | "organizer", targetId: string): Promise<{ following: boolean; auth: boolean }> {
  const user = await getSessionUser();
  if (!user) return { following: false, auth: false };
  const where = and(eq(follows.userId, user.id), eq(follows.targetType, targetType), eq(follows.targetId, targetId));
  const existing = await db.query.follows.findFirst({ where });
  if (existing) {
    await db.delete(follows).where(where);
    return { following: false, auth: true };
  }
  await db.insert(follows).values({ userId: user.id, targetType, targetId }).onConflictDoNothing();
  revalidatePath("/artistas/[slug]", "page");
  return { following: true, auth: true };
}

export async function subscribeNewsletter(_prev: { ok?: boolean; error?: string } | null, formData: FormData) {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "Confira o e-mail, parece incompleto." };
  await db.insert(newsletterSubscribers).values({ email: parsed.data.toLowerCase() }).onConflictDoNothing();
  return { ok: true };
}
