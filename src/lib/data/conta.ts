import "server-only";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

/** Pessoa logada (com a segunda etapa feita) e o perfil dela; sem login vai para /entrar e volta para `path`. */
export async function contaUser(path: string) {
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(path)}`);
  const profile = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, user.id) });
  return { user, profile: profile ?? null };
}

export async function listOrders(userId: string) {
  return db.query.orders.findMany({
    where: eq(schema.orders.userId, userId),
    with: { event: { with: { venue: { with: { city: true } } } }, items: true },
    orderBy: [desc(schema.orders.createdAt)],
    limit: 100,
  });
}

export async function listSecurityEvents(userId: string) {
  return db.query.securityEvents.findMany({ where: eq(schema.securityEvents.userId, userId), orderBy: [desc(schema.securityEvents.createdAt)], limit: 15 });
}
