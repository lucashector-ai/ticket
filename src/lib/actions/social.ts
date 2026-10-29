"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

const { follows, newsletterSubscribers } = schema;

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
