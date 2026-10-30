import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Equipe da produtora (pedido do dono: "colocando um admin, ele consegue criar eventos dentro da produtora?").
 * Antes da correção, o evento criado por um admin (ou por alguém da portaria) ia para uma produtora NOVA da própria
 * pessoa (a produtora era achada pelo dono), e só quem criou um evento conseguia editá-lo.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// produtora escolhida no seletor (cookie tw_org)
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
  headers: async () => new Headers(),
}));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db");
const users: string[] = [], orgs: string[] = [];
const person = (p: string): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: true }; };
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };

describe.skipIf(!TEST_DB)("equipe da produtora: admin e portaria (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray, or } = await import("drizzle-orm");
    const own = users.length ? await db.select({ id: schema.organizers.id }).from(schema.organizers).where(inArray(schema.organizers.ownerUserId, users)) : [];
    const all = [...new Set([...orgs, ...own.map((o) => o.id)])];
    if (all.length || users.length) await db.delete(schema.events).where(or(all.length ? inArray(schema.events.organizerId, all) : undefined, users.length ? inArray(schema.events.createdByUserId, users) : undefined));
    if (all.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, all));
  });

  it("admin convidado cria e edita evento NA produtora da dona (publicar passa pela mesma ação); vê as vendas; não mexe em equipe, configurações nem saldo", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const C = await import("@/lib/actions/criar");
    const B = await import("@/lib/bank");
    const { getPainelScope } = await import("@/lib/data/painel");
    const { emptyDraft } = await import("@/lib/criar/model");
    const owner = person("dona"), admin = person("admin");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org-dona"), name: "Produtora da Dona QA", ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);

    // convite pela tela Equipe e aceite (o admin entra com o e-mail confirmado do convite)
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    const scope = await getPainelScope(admin);
    expect(scope.org?.id).toBe(org.id);
    expect(scope.role).toBe("admin");

    // admin cria um evento: vai para a produtora da dona, e ele não ganha produtora própria
    const draft = { ...emptyDraft(), title: "QA evento do admin", vis: "rascunho" as const };
    const made = await as(admin, () => C.saveEvent({ draft, eventId: null, dbMap: {} as never }));
    expect(made).toMatchObject({ ok: true });
    if (!made.ok) return;
    const ev = await db.query.events.findFirst({ where: eq(schema.events.id, made.eventId) });
    expect(ev?.organizerId).toBe(org.id);
    expect(await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, admin.id) })).toBeUndefined();

    // a dona vê e edita o evento do admin; o admin edita o evento da dona; a edição não muda produtora nem criador
    const fromOwner = await as(owner, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento da dona", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    expect(fromOwner).toMatchObject({ ok: true });
    if (!fromOwner.ok) return;
    expect(await as(owner, () => C.saveEvent({ draft: { ...draft, title: "QA evento do admin (editado pela dona)" }, eventId: made.eventId, dbMap: made.dbMap }))).toMatchObject({ ok: true });
    expect(await as(admin, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento da dona (editado pelo admin)", vis: "rascunho" }, eventId: fromOwner.eventId, dbMap: fromOwner.dbMap }))).toMatchObject({ ok: true });
    const ownerEv = await db.query.events.findFirst({ where: eq(schema.events.id, fromOwner.eventId) });
    expect(ownerEv).toMatchObject({ organizerId: org.id, createdByUserId: owner.id, title: "QA evento da dona (editado pelo admin)" });
    // os dois enxergam os dois eventos no painel (vendas, pedidos, check-in)
    const ids = (await getPainelScope(admin)).events.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([made.eventId, fromOwner.eventId]));
    expect((await getPainelScope(owner)).events.map((e) => e.id)).toEqual(expect.arrayContaining([made.eventId, fromOwner.eventId]));

    // o que o admin NÃO pode: equipe, configurações (dados de recebimento) e saldo/saque
    expect(await as(admin, () => P.inviteMember(`${qaId("x")}@example.com`, "admin"))).toMatchObject({ ok: false });
    const members = await db.query.organizerMembers.findMany({ where: eq(schema.organizerMembers.organizerId, org.id) });
    expect(await as(admin, () => P.removeMember(members[0].id))).toMatchObject({ ok: false });
    const settings = {
      name: "Tomada", slug: qaId("tomada"), contactEmail: "", legalName: "", cnpj: "",
      payout: { bank: "", agency: "", account: "", kind: "corrente" as const, holder: "", doc: "", pixKey: "golpe@example.com" },
      defaults: { buyerPaysFee: true, autoMeia: true, age: "18+" as const, refund: "" },
    };
    expect(await as(admin, () => P.saveSettings(settings))).toMatchObject({ ok: false });
    expect((await db.query.organizers.findFirst({ where: eq(schema.organizers.id, org.id) }))?.payout).toBeNull();
    expect(await B.walletFor(admin.id)).toBeNull();
    expect(await B.walletFor(owner.id)).not.toBeNull();
  });

  it("portaria: só a portaria; não cria nem edita evento e não ganha produtora própria", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const C = await import("@/lib/actions/criar");
    const { getPainelScope } = await import("@/lib/data/painel");
    const { emptyDraft } = await import("@/lib/criar/model");
    const owner = person("dona-p"), door = person("portaria");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org-p"), name: "Produtora Portaria QA", ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    expect(await as(owner, () => P.inviteMember(door.email, "portaria"))).toMatchObject({ ok: true });
    expect((await getPainelScope(door)).role).toBe("portaria");
    const ev = await as(owner, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento portaria", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    if (!ev.ok) throw new Error(ev.error);
    const made = await as(door, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA portaria tentando criar", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    expect(made).toMatchObject({ ok: false });
    expect(await as(door, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA portaria editando", vis: "rascunho" }, eventId: ev.eventId, dbMap: ev.dbMap }))).toMatchObject({ ok: false });
    expect(await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, door.id) })).toBeUndefined();
    // cupom (admin) também não
    expect(await as(door, () => P.createCoupon({ eventId: ev.eventId, code: qaId("c").slice(-10).toUpperCase(), kind: "pct", value: 10, limit: 0, until: "" }))).toMatchObject({ ok: false });
  });
});
