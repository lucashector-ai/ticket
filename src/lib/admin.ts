import "server-only";
import { and, count, desc, eq, inArray, isNotNull, or, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { mfaSettings } from "@/lib/mfa";
import { userContact } from "@/lib/notify";
import { CENTRAL_SOURCE, producerStatus, type ProducerStatus } from "@/lib/producer-apply";

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
  // e-mail confirmado: a central nunca vale para uma conta que só digitou o e-mail de um admin
  if (!user?.email || !user.emailVerified || !isAdminEmail(user.email)) return null;
  const mfa = await mfaSettings(user.id);
  return { ...user, secure: mfa.method === "totp" };
}

const { orders, events, payoutRequests, producerApplications, organizers, organizerMembers, userProfiles } = schema;

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

/** `producer`: mesmo status de producerStatus() (lib/producer-apply), calculado em lote para a lista. */
export type AdminUserRow = { id: string; name: string; email: string; verified: boolean; createdAt: string; producer: ProducerStatus; mfa: string | null; paidOrders: number; google: boolean };

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
  // mesma regra de isProducer (lib/data/producer): cadastro concluído, equipe de um produtor ou já criou evento
  const verifiedEmails = base.filter((b) => b.verified && b.email).map((b) => b.email.toLowerCase());
  const [profiles, owners, members, creators, apps, buys] = await Promise.all([
    db.query.userProfiles.findMany({ where: inArray(userProfiles.userId, ids), columns: { userId: true, mfaMethod: true } }),
    db.select({ userId: organizers.ownerUserId }).from(organizers).where(and(inArray(organizers.ownerUserId, ids), isNotNull(organizers.onboarding))),
    db.select({ userId: organizerMembers.userId, email: organizerMembers.email }).from(organizerMembers)
      .where(verifiedEmails.length ? or(inArray(organizerMembers.userId, ids), inArray(sql`lower(${organizerMembers.email})`, verifiedEmails)) : inArray(organizerMembers.userId, ids)),
    db.selectDistinct({ userId: events.createdByUserId }).from(events).where(inArray(events.createdByUserId, ids)),
    // última inscrição de cada conta
    db.selectDistinctOn([producerApplications.userId], { userId: producerApplications.userId, status: producerApplications.status })
      .from(producerApplications).where(inArray(producerApplications.userId, ids)).orderBy(producerApplications.userId, desc(producerApplications.createdAt)),
    db.select({ userId: orders.userId, n: count() }).from(orders).where(and(inArray(orders.userId, ids), eq(orders.status, "paid"))).groupBy(orders.userId),
  ]);
  const mfa = new Map(profiles.map((p) => [p.userId, p.mfaMethod]));
  const prod = new Set<string>([...owners, ...creators].map((o) => o.userId ?? ""));
  for (const m of members) if (m.userId) prod.add(m.userId);
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const app = new Map(apps.map((a) => [a.userId, a.status]));
  const nb = new Map(buys.map((b) => [b.userId, b.n]));
  return base.map((b) => ({
    id: b.id, name: b.name ?? "", email: b.email, verified: !!b.verified, createdAt: new Date(b.created).toISOString(),
    producer: prod.has(b.id) || (!!b.verified && memberEmails.has(b.email.toLowerCase())) ? "producer" : app.get(b.id) ?? "none",
    mfa: mfa.get(b.id) ?? null, paidOrders: nb.get(b.id) ?? 0, google: !!b.google,
  }));
}

type Grant = { ok: true; app: typeof producerApplications.$inferSelect } | { ok: false; error: string };
const validUserId = (id: string) => (typeof id === "string" && id.trim().length > 0 && id.length <= 100 ? id.trim() : null);

/**
 * Libera a conta como produtor, como se a inscrição tivesse sido aprovada (a central chama com o e-mail do admin).
 * Com inscrição pendente ou recusada, aprova a mais recente; sem inscrição, cria uma já aprovada
 * (source = CENTRAL_SOURCE) com nome, e-mail, telefone e cidade do perfil. Depois a pessoa faz /produtores/cadastro.
 */
export async function grantProducer(userId: string, by: string): Promise<Grant> {
  const id = validUserId(userId);
  const contact = id ? await userContact(id) : null;
  if (!id || !contact) return { ok: false, error: "Conta não encontrada." };
  const { status, app } = await producerStatus({ id, email: contact.email });
  if (status === "producer") return { ok: false, error: "Essa conta já é produtor." };
  if (status === "approved") return { ok: false, error: "Essa conta já está liberada; falta só o cadastro do produtor." };
  const review = { status: "approved" as const, reviewedBy: by, reviewedAt: new Date() };
  if (app && (app.status === "pending" || app.status === "rejected")) {
    const [row] = await db.update(producerApplications).set({ ...review, note: "Liberado pela central." }).where(eq(producerApplications.id, app.id)).returning();
    return { ok: true, app: row };
  }
  const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, id), columns: { name: true, phone: true, cityId: true } });
  const city = profile?.cityId ? await db.query.cities.findFirst({ where: eq(schema.cities.id, profile.cityId), columns: { name: true, uf: true } }) : null;
  const [first = "", ...rest] = (contact.name || profile?.name || contact.email.split("@")[0]).trim().split(/\s+/);
  const [row] = await db.insert(producerApplications).values({
    ...review, userId: id, email: contact.email.slice(0, 254),
    firstName: first.slice(0, 80), lastName: rest.join(" ").slice(0, 80), phone: (profile?.phone ?? "").slice(0, 32),
    city: city?.name ?? "", uf: city?.uf ?? "", audience: "Conta liberada pela equipe na central, sem inscrição.",
    category: "Outro", avgTicketCents: 0, expected: 0, source: CENTRAL_SOURCE, note: "Liberado pela central, sem inscrição.",
  }).returning();
  return { ok: true, app: row };
}

/**
 * Tira a permissão de quem foi liberado mas ainda não concluiu o cadastro do produtor.
 * Inscrição criada pela central é apagada (volta a "sem inscrição"); inscrição de verdade fica recusada.
 */
export async function ungrantProducer(userId: string, by: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const id = validUserId(userId);
  if (!id) return { ok: false, error: "Conta não encontrada." };
  const contact = await userContact(id);
  const { status, app } = await producerStatus({ id, email: contact?.email });
  if (status !== "approved" || !app) return { ok: false, error: status === "producer" ? "Essa conta já concluiu o cadastro de produtor." : "Essa conta não está liberada." };
  if (app.source === CENTRAL_SOURCE) await db.delete(producerApplications).where(and(eq(producerApplications.id, app.id), eq(producerApplications.status, "approved")));
  else await db.update(producerApplications).set({ status: "rejected", note: "A permissão para criar eventos foi removida pela equipe da Tickets Win.", reviewedBy: by, reviewedAt: new Date() }).where(eq(producerApplications.id, app.id));
  return { ok: true, email: contact?.email ?? app.email };
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

export type AdminHighlightEvent = {
  id: string; title: string; slug: string; when: string; city: string; producer: string;
  flyerId: string; bannerId: string | null; heroOrder: number | null; featuredOrder: number | null; heroArt: string | null; heroHtml: string | null;
};

/** Eventos publicados que ainda não terminaram, para escolher banner e destaques da home. */
export async function adminHighlights(): Promise<AdminHighlightEvent[]> {
  const rows = await db.query.events.findMany({
    where: and(eq(events.status, "published"), sql`coalesce(${events.endAt}, ${events.startAt}) >= now()`),
    columns: { id: true, title: true, slug: true, startAt: true, dateLabel: true, flyerId: true, bannerId: true, heroOrder: true, featuredOrder: true, heroArt: true, heroHtml: true },
    with: { venue: { columns: {}, with: { city: { columns: { name: true, uf: true } } } }, organizer: { columns: { name: true } } },
    orderBy: [events.startAt],
    limit: 300,
  });
  return rows.map((e) => ({
    id: e.id, title: e.title, slug: e.slug, when: e.dateLabel ?? e.startAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    city: e.venue?.city ? `${e.venue.city.name} – ${e.venue.city.uf}` : "", producer: e.organizer?.name ?? "",
    flyerId: e.flyerId, bannerId: e.bannerId, heroOrder: e.heroOrder, featuredOrder: e.featuredOrder, heroArt: e.heroArt, heroHtml: e.heroHtml,
  }));
}
