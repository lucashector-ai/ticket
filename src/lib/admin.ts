import "server-only";
import { and, count, desc, eq, inArray, isNotNull, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { mfaSettings } from "@/lib/mfa";

/*
 * Central da Tickets Win: página fora de qualquer menu, só para os e-mails de ADMIN_EMAILS
 * (e sempre do domínio @ticketswin.com.br) e só com o app autenticador ligado.
 * Para quem não é admin a página simplesmente não existe (404).
 */

export const ADMIN_PATH = "/tw-central";

/** Trava fixa: mesmo com ADMIN_EMAILS mal configurado, só e-mail da própria Tickets Win entra. */
const ADMIN_DOMAIN = "@ticketswin.com.br";

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || "lucas@ticketswin.com.br").split(",").map((s) => s.trim().toLowerCase()).filter((e) => e.endsWith(ADMIN_DOMAIN));
}

export function isAdminEmail(email: string | null | undefined) {
  const e = email?.trim().toLowerCase();
  return !!e && e.endsWith(ADMIN_DOMAIN) && adminEmails().includes(e);
}

/** Admin logado (ou null). `secure`: já tem o app autenticador, exigido para ver e mexer em qualquer coisa. */
export async function adminUser() {
  const user = await getSessionUser();
  if (!user?.email || !isAdminEmail(user.email)) return null;
  const mfa = await mfaSettings(user.id);
  return { ...user, secure: mfa.method === "totp" };
}

const { orders, events, payoutRequests, producerApplications, organizers, userProfiles } = schema;

export async function adminOverview() {
  const [paid] = await db.select({ n: count(), total: sum(orders.totalCents), fees: sum(orders.feeCents) }).from(orders).where(eq(orders.status, "paid"));
  const [evs] = await db.select({ n: count() }).from(events).where(eq(events.status, "published"));
  // todo produtor tem uma linha em organizers (com ou sem /produtores/cadastro); os de exemplo não têm dono
  const [orgs] = await db.select({ n: count() }).from(organizers).where(isNotNull(organizers.ownerUserId));
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

export type AdminProducerRow = {
  id: string; name: string; slug: string; ownerEmail: string | null; contactEmail: string | null; city: string | null; uf: string | null;
  instagram: string | null; createdAt: string; events: number; published: number; orders: number; total: number; approvedApp: boolean; onboarded: boolean; verified: boolean;
};

/** E-mail de cada dono (neon_auth.user; se não der, o e-mail salvo no perfil). */
async function ownerEmails(ids: string[]) {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  try {
    const r = await db.execute<{ id: string; email: string }>(sql`select u.id, u.email from neon_auth."user" u where u.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    for (const u of r.rows) if (u.email) out.set(u.id, u.email);
  } catch { /* sem acesso ao neon_auth: cai no perfil */ }
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const p = await db.query.userProfiles.findMany({ where: inArray(userProfiles.userId, missing), columns: { userId: true, email: true } });
    for (const x of p) if (x.email) out.set(x.userId, x.email);
  }
  return out;
}

/** Produtores cadastrados (os mais novos primeiro), com busca por nome, página, e-mail, cidade ou Instagram. */
export async function adminProducers(q: string): Promise<AdminProducerRow[]> {
  const t = q.trim().toLowerCase();
  let where;
  if (t) {
    const like = `%${t}%`;
    // donos cujo e-mail de login bate com a busca
    let owners: string[] = [];
    try {
      owners = (await db.execute<{ id: string }>(sql`select u.id from neon_auth."user" u where lower(u.email) like ${like} limit 200`)).rows.map((r) => r.id);
    } catch {
      owners = (await db.select({ id: userProfiles.userId }).from(userProfiles).where(sql`lower(coalesce(${userProfiles.email},'')) like ${like}`).limit(200)).map((r) => r.id);
    }
    const text = sql`lower(concat_ws(' ', ${organizers.name}, ${organizers.slug}, ${organizers.contactEmail}, ${organizers.instagram}, ${organizers.cityName}, ${organizers.uf})) like ${like}`;
    where = owners.length ? sql`(${text} or ${inArray(organizers.ownerUserId, owners)})` : text;
  }
  const orgs = await db.query.organizers.findMany({
    where, orderBy: [desc(organizers.createdAt)], limit: 200,
    columns: { id: true, name: true, slug: true, ownerUserId: true, contactEmail: true, cityName: true, uf: true, instagram: true, createdAt: true, onboarding: true, verified: true },
  });
  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const uids = [...new Set(orgs.map((o) => o.ownerUserId).filter((x): x is string => !!x))];
  const [evs, sales, apps, emails] = await Promise.all([
    db.select({ org: events.organizerId, n: count(), pub: sql<number>`count(*) filter (where ${events.status} = 'published')`.mapWith(Number) })
      .from(events).where(inArray(events.organizerId, ids)).groupBy(events.organizerId),
    db.select({ org: events.organizerId, n: count(), total: sum(orders.totalCents) })
      .from(orders).innerJoin(events, eq(orders.eventId, events.id)).where(and(eq(orders.status, "paid"), inArray(events.organizerId, ids))).groupBy(events.organizerId),
    uids.length
      ? db.select({ userId: producerApplications.userId }).from(producerApplications).where(and(inArray(producerApplications.userId, uids), eq(producerApplications.status, "approved")))
      : Promise.resolve([] as { userId: string }[]),
    ownerEmails(uids),
  ]);
  const ev = new Map(evs.map((e) => [e.org, e]));
  const sold = new Map(sales.map((s) => [s.org, s]));
  const approved = new Set(apps.map((a) => a.userId));
  return orgs.map((o) => ({
    id: o.id, name: o.name, slug: o.slug, ownerEmail: o.ownerUserId ? emails.get(o.ownerUserId) ?? null : null, contactEmail: o.contactEmail,
    city: o.cityName, uf: o.uf, instagram: o.instagram, createdAt: o.createdAt.toISOString(),
    events: ev.get(o.id)?.n ?? 0, published: ev.get(o.id)?.pub ?? 0, orders: sold.get(o.id)?.n ?? 0, total: Number(sold.get(o.id)?.total ?? 0),
    approvedApp: !!o.ownerUserId && approved.has(o.ownerUserId), onboarded: !!o.onboarding, verified: o.verified,
  }));
}
