import "server-only";
import { and, desc, eq, notLike } from "drizzle-orm";
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
  // as tentativas de código (contador do SEC-301, tipo "try:…") não são acontecimentos para mostrar à pessoa
  return db.query.securityEvents.findMany({ where: and(eq(schema.securityEvents.userId, userId), notLike(schema.securityEvents.kind, "try:%")), orderBy: [desc(schema.securityEvents.createdAt)], limit: 15 });
}
