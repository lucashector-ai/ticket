import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Conta com e-mail não ativado (achado do Marcos, rodada 2): entrava com senha e enviava a inscrição de produtor.
 * Regra: comprar continua liberado; virar produtor (inscrição e cadastro do produtor aprovado) exige o e-mail
 * confirmado; quem já é produtor continua liberado. Sem a correção, os testes de recusa falham (a inscrição era gravada).
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db");
const users: string[] = [], orgs: string[] = [];
const userOf = (p: string, verified: boolean): U => {
  const id = qaId(p);
  users.push(id);
  return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: verified };
};
const app = {
  firstName: "Pessoa", lastName: "Teste", phone: "11987654321", company: "", city: "São Paulo", uf: "SP",
  audience: "Universitários da zona oeste, festas de sábado.", category: "Festa / balada", avgTicket: "50", expected: "300",
  source: "Instagram", instagram: "",
} as const;

describe.skipIf(!TEST_DB)("conta sem e-mail ativado (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (users.length) await db.delete(schema.producerApplications).where(inArray(schema.producerApplications.userId, users));
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  it("recusa a inscrição de produtor e pede a ativação; nada é gravado", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const I = await import("@/lib/actions/inscricao");
    const u = userOf("sem-ativar", false);
    session.user = u;
    const r = await I.submitApplication({ ...app });
    session.user = null;
    const row = await db.query.producerApplications.findFirst({ where: eq(schema.producerApplications.userId, u.id) });
    expect(r).toMatchObject({ ok: false, verify: true });
    expect(row).toBeUndefined();
  });

  it("com o e-mail confirmado, a inscrição segue normal", async () => {
    const I = await import("@/lib/actions/inscricao");
    session.user = userOf("ativada", true);
    const r = await I.submitApplication({ ...app });
    session.user = null;
    expect(r.ok).toBe(true);
  });

  it("aprovado sem ativar não monta a página de produtor nem cria evento", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const u = userOf("aprovado-sem-ativar", false);
    await db.insert(schema.producerApplications).values({
      userId: u.id, email: u.email, firstName: "Pessoa", lastName: "Teste", phone: "11987654321", city: "São Paulo", uf: "SP",
      audience: app.audience, category: app.category, avgTicketCents: 5000, expected: 300, source: "Instagram", status: "approved",
    });
    const O = await import("@/lib/actions/onboarding");
    const C = await import("@/lib/actions/criar");
    const { emptyDraft } = await import("@/lib/criar/model");
    session.user = u;
    const ob = await O.finishOnboarding({ name: `Produtora ${u.id}`, city: "São Paulo", uf: "SP", instagram: "", tagline: "" });
    const ev = await C.saveEvent({ draft: emptyDraft(), eventId: null, dbMap: {} as never });
    session.user = null;
    const org = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, u.id) });
    if (org) orgs.push(org.id);
    expect(ob.ok).toBe(false);
    expect(ev.ok).toBe(false);
    expect(org).toBeUndefined();
  });

  it("produtor antigo sem e-mail confirmado continua usando o painel (não trava quem já vende)", async () => {
    const { db, schema } = D;
    const u = userOf("dono-sem-ativar", false);
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA", ownerUserId: u.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const P = await import("@/lib/actions/painel");
    session.user = u;
    const r = await P.inviteMember(`${qaId("membro")}@example.com`, "portaria");
    session.user = null;
    await db.delete(schema.organizerMembers).where((await import("drizzle-orm")).eq(schema.organizerMembers.organizerId, org.id));
    expect(r.ok).toBe(true);
  });

  it("D-08 (decidido: manter): produtor antigo sem e-mail confirmado segue produtor, cria evento e atualiza a página do produtor", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { producerStatus } = await import("@/lib/producer-apply");
    const C = await import("@/lib/actions/criar");
    const O = await import("@/lib/actions/onboarding");
    const { emptyDraft } = await import("@/lib/criar/model");
    const old = userOf("produtor-antigo", false);
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org-antigo"), name: "Produtora Antiga QA", ownerUserId: old.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    expect((await producerStatus(old)).status).toBe("producer");
    session.user = old;
    const ev = await C.saveEvent({ draft: { ...emptyDraft(), title: "QA D-08 produtor antigo", vis: "rascunho" }, eventId: null, dbMap: {} as never });
    // atualizar a página do produtor (onboarding de novo) também segue liberado para quem já é produtor
    const ob = await O.finishOnboarding({ name: `Produtora Antiga ${old.id.slice(-8)}`, city: "São Paulo", uf: "SP", instagram: "", tagline: "" });
    session.user = null;
    if (ev.ok) await db.delete(schema.events).where(eq(schema.events.id, ev.eventId));
    expect(ev).toMatchObject({ ok: true });
    expect(ob).toMatchObject({ ok: true });
  });

  it("a sessão desatualizada não prende quem acabou de ativar: confere no banco do login", async () => {
    const { db } = D;
    const { sql } = await import("drizzle-orm");
    const { emailConfirmed } = await import("@/lib/auth/verified");
    const r = await db.execute<{ id: string; v: boolean }>(sql`(select id::text, "emailVerified" v from neon_auth."user" where "emailVerified" limit 1)
      union all (select id::text, "emailVerified" v from neon_auth."user" where not "emailVerified" limit 1)`);
    const yes = r.rows.find((x) => x.v), no = r.rows.find((x) => !x.v);
    if (yes) expect(await emailConfirmed({ id: yes.id, emailVerified: false })).toBe(true);
    if (no) expect(await emailConfirmed({ id: no.id, emailVerified: false })).toBe(false);
    expect(await emailConfirmed({ id: "qa-test-qualquer", emailVerified: true })).toBe(true);
  });
});
