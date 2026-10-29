import "server-only";
import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { mfaSettings } from "@/lib/mfa";

/*
 * Central da Tickets Win: página fora de qualquer menu, só para os e-mails de ADMIN_EMAILS
 * e só com o app autenticador ligado. Para quem não é admin a página simplesmente não existe (404).
 */

export const ADMIN_PATH = "/tw-central";

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || "lucas@ticketswin.com.br").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Admin logado (ou null). `secure`: já tem o app autenticador, exigido para mexer em qualquer coisa. */
export async function adminUser() {
  const user = await getSessionUser();
  if (!user?.email || !adminEmails().includes(user.email.toLowerCase())) return null;
  const mfa = await mfaSettings(user.id);
  return { ...user, secure: mfa.method === "totp" };
}

const { orders, events, payoutRequests, producerApplications, organizers, userProfiles } = schema;

export async function adminOverview() {
  const [paid] = await db.select({ n: count(), total: sum(orders.totalCents), fees: sum(orders.feeCents) }).from(orders).where(eq(orders.status, "paid"));
  const [evs] = await db.select({ n: count() }).from(events).where(eq(events.status, "published"));
  const [orgs] = await db.select({ n: count() }).from(organizers).where(sql`${organizers.onboarding} is not null`);
  const [apps] = await db.select({ n: count() }).from(producerApplications).where(eq(producerApplications.status, "pending"));
  const [outs] = await db.select({ n: count(), total: sum(payoutRequests.amountCents) }).from(payoutRequests).where(inArray(payoutRequests.status, ["requested", "processing"]));
  let users = 0;
  try { users = Number((await db.execute<{ n: number }>(sql`select count(*)::int n from neon_auth."user"`)).rows[0]?.n ?? 0); } catch {
    users = (await db.select({ n: count() }).from(userProfiles))[0]?.n ?? 0;
  }
  return {
    users, producers: orgs.n, events: evs.n, orders: paid.n, gmv: Number(paid.total ?? 0), buyerFees: Number(paid.fees ?? 0),
    pendingApps: apps.n, pendingPayouts: outs.n, pendingPayoutTotal: Number(outs.total ?? 0),
  };
}

export async function adminApplications() {
  return db.query.producerApplications.findMany({ orderBy: [sql`case when ${producerApplications.status} = 'pending' then 0 else 1 end`, desc(producerApplications.createdAt)], limit: 200 });
}

export async function adminPayouts() {
  const rows = await db.query.payoutRequests.findMany({ orderBy: [sql`case when ${payoutRequests.status} in ('requested','processing') then 0 else 1 end`, desc(payoutRequests.createdAt)], limit: 200, with: { organizer: { columns: { name: true } } } });
  return rows;
}

export type AdminUserRow = { id: string; name: string; email: string; verified: boolean; createdAt: string; producer: boolean; mfa: string | null; paidOrders: number; google: boolean };

/** Contas criadas (as mais novas primeiro), com busca por nome ou e-mail. */
export async function adminUsers(q: string): Promise<AdminUserRow[]> {
  const like = `%${q.trim().toLowerCase()}%`;
  let base: { id: string; name: string | null; email: string; verified: boolean; created: Date; google: boolean }[] = [];
  try {
    const r = await db.execute<{ id: string; name: string | null; email: string; verified: boolean; created: Date; google: boolean }>(sql`
      select u.id, u.name, u.email, u."emailVerified" verified, u."createdAt" created,
        exists(select 1 from neon_auth.account a where a."userId" = u.id and a."providerId" = 'google') google
      from neon_auth."user" u
      where ${q.trim() ? sql`(lower(u.email) like ${like} or lower(coalesce(u.name,'')) like ${like})` : sql`true`}
      order by u."createdAt" desc limit 200`);
    base = r.rows;
  } catch {
    const p = await db.query.userProfiles.findMany({ orderBy: [desc(userProfiles.createdAt)], limit: 200 });
    base = p.filter((x) => !q.trim() || `${x.email} ${x.name}`.toLowerCase().includes(q.trim().toLowerCase())).map((x) => ({ id: x.userId, name: x.name, email: x.email ?? "", verified: false, created: x.createdAt, google: false }));
  }
  const ids = base.map((b) => b.id);
  if (!ids.length) return [];
  const [profiles, owners, buys] = await Promise.all([
    db.query.userProfiles.findMany({ where: inArray(userProfiles.userId, ids), columns: { userId: true, mfaMethod: true } }),
    db.query.organizers.findMany({ where: inArray(organizers.ownerUserId, ids), columns: { ownerUserId: true } }),
    db.select({ userId: orders.userId, n: count() }).from(orders).where(and(inArray(orders.userId, ids), eq(orders.status, "paid"))).groupBy(orders.userId),
  ]);
  const mfa = new Map(profiles.map((p) => [p.userId, p.mfaMethod]));
  const own = new Set(owners.map((o) => o.ownerUserId));
  const nb = new Map(buys.map((b) => [b.userId, b.n]));
  return base.map((b) => ({
    id: b.id, name: b.name ?? "", email: b.email, verified: !!b.verified, createdAt: new Date(b.created).toISOString(),
    producer: own.has(b.id), mfa: mfa.get(b.id) ?? null, paidOrders: nb.get(b.id) ?? 0, google: !!b.google,
  }));
}

/** Eventos de todos os produtores, com ingressos vendidos e receita. */
export async function adminEvents() {
  const evs = await db.query.events.findMany({ orderBy: [desc(events.startAt)], limit: 200, columns: { id: true, title: true, slug: true, status: true, startAt: true }, with: { organizer: { columns: { name: true } } } });
  const sales = await db.select({ eventId: orders.eventId, n: count(), total: sum(orders.totalCents) }).from(orders).where(eq(orders.status, "paid")).groupBy(orders.eventId);
  const by = new Map(sales.map((s) => [s.eventId, s]));
  return evs.map((e) => ({ ...e, orders: by.get(e.id)?.n ?? 0, total: Number(by.get(e.id)?.total ?? 0) }));
}
