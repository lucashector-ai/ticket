import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Várias produtoras numa conta (até 3), cada uma isolada: eventos, equipe, recebimento e saldo. A produtora ativa
 * vem do cookie tw_org, conferido a cada pedido (trocar o id não dá acesso a produtora de outra pessoa).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
  headers: async () => new Headers(),
}));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db");
const users: string[] = [];
const person = (p: string): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: true }; };
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
async function producer(p: string) {
  const { db, schema } = D;
  const u = person(p);
  const [org] = await db.insert(schema.organizers).values({ slug: qaId(`org-${p}`), name: `Produtora ${u.id}`, ownerUserId: u.id, onboarding: { kind: "festas" } as never }).returning();
  return { u, org };
}

describe.skipIf(!TEST_DB)("várias produtoras numa conta (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    jar.clear();
    if (!D || !users.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    const own = await db.select({ id: schema.organizers.id }).from(schema.organizers).where(inArray(schema.organizers.ownerUserId, users));
    const ids = own.map((o) => o.id);
    if (ids.length) {
      await db.delete(schema.payoutRequests).where(inArray(schema.payoutRequests.organizerId, ids));
      await db.delete(schema.events).where(inArray(schema.events.organizerId, ids));
      await db.delete(schema.organizers).where(inArray(schema.organizers.id, ids));
    }
  });

  it("cria até 3 produtoras; cada uma com eventos, recebimento e saldo próprios; a troca muda tudo junto", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const A = await import("@/lib/actions/produtoras");
    const C = await import("@/lib/actions/criar");
    const P = await import("@/lib/actions/painel");
    const B = await import("@/lib/bank");
    const { getPainelScope } = await import("@/lib/data/painel");
    const { emptyDraft } = await import("@/lib/criar/model");
    jar.clear();
    const { u, org: first } = await producer("multi");

    const second = await as(u, () => A.createOrganizer(null, form({ name: `Segunda ${u.id}`, city: "Rio de Janeiro", uf: "rj", instagram: "@segunda", tagline: "Festas" })));
    expect(second).toMatchObject({ ok: true });
    if (!second.ok) return;
    // a nova fica ativa: o evento novo vai para ela
    expect(jar.get("tw_org")).toBe(second.id);
    const ev2 = await as(u, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento da segunda", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    if (!ev2.ok) throw new Error(ev2.error);
    expect((await db.query.events.findFirst({ where: eq(schema.events.id, ev2.eventId) }))?.organizerId).toBe(second.id);
    const s2 = await getPainelScope(u);
    expect(s2.org?.id).toBe(second.id);
    expect(s2.orgs.map((x) => x.org.id)).toEqual([first.id, second.id]);
    expect(s2.canCreateOrg).toBe(true);

    // recebimento da segunda; a primeira não muda
    const settings = (pix: string) => ({
      name: `Segunda ${u.id}`, slug: second.slug, contactEmail: "", legalName: "Segunda LTDA", cnpj: "",
      payout: { bank: "", agency: "", account: "", kind: "corrente" as const, holder: "", doc: "", pixKey: pix },
      defaults: { buyerPaysFee: true, autoMeia: true, age: "18+" as const, refund: "" },
    });
    expect(await as(u, () => P.saveSettings(settings("segunda@example.com")))).toMatchObject({ ok: true });
    expect((await db.query.organizers.findFirst({ where: eq(schema.organizers.id, second.id) }))?.payout).toMatchObject({ pixKey: "segunda@example.com" });
    expect((await db.query.organizers.findFirst({ where: eq(schema.organizers.id, first.id) }))?.payout).toBeNull();
    // saque da primeira não aparece no saldo da segunda
    await db.insert(schema.payoutRequests).values({ userId: u.id, organizerId: first.id, amountCents: 1234, status: "paid" });
    expect((await B.walletFor(u.id))?.payouts.map((p) => p.amountCents)).toEqual([]);

    // volta para a primeira: só os eventos e o saque dela
    expect(await as(u, () => A.setActiveOrganizer(first.id))).toMatchObject({ ok: true });
    const s1 = await getPainelScope(u);
    expect(s1.org?.id).toBe(first.id);
    expect(s1.events.map((e) => e.id)).not.toContain(ev2.eventId);
    expect((await B.walletFor(u.id))?.payouts.map((p) => p.amountCents)).toEqual([1234]);
    expect((await B.walletFor(u.id))?.destination).toBeNull();

    // terceira ok; quarta recusada
    expect(await as(u, () => A.createOrganizer(null, form({ name: `Terceira ${u.id}` })))).toMatchObject({ ok: true });
    expect(await as(u, () => A.createOrganizer(null, form({ name: `Quarta ${u.id}` })))).toMatchObject({ ok: false, error: "Você já tem 3 produtoras, o máximo por conta." });
    expect((await getPainelScope(u)).canCreateOrg).toBe(false);
    // nome de outra produtora (inclusive da mesma conta) não vale
    const { u: v } = await producer("nome");
    expect(await as(v, () => A.createOrganizer(null, form({ name: `Segunda ${u.id}` })))).toMatchObject({ ok: false });
  });

  it("dois pedidos ao mesmo tempo não passam do limite de 3", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const A = await import("@/lib/actions/produtoras");
    jar.clear();
    const { u } = await producer("corrida");
    expect(await as(u, () => A.createOrganizer(null, form({ name: `Corrida B ${u.id}` })))).toMatchObject({ ok: true });
    session.user = u;
    const rs = await Promise.all([1, 2, 3].map((i) => A.createOrganizer(null, form({ name: `Corrida ${i} ${u.id}` }))));
    session.user = null;
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(schema.organizers).where(eq(schema.organizers.ownerUserId, u.id))).toHaveLength(3);
  });

  it("trocar o id não dá acesso: produtora de outra pessoa é recusada no seletor e ignorada no cookie", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const A = await import("@/lib/actions/produtoras");
    const C = await import("@/lib/actions/criar");
    const P = await import("@/lib/actions/painel");
    const { getPainelScope } = await import("@/lib/data/painel");
    const { emptyDraft } = await import("@/lib/criar/model");
    jar.clear();
    const { u: alice, org: aliceOrg } = await producer("alice");
    const { u: bob, org: bobOrg } = await producer("bob");
    const bobEv = await as(bob, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento do Bob", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    if (!bobEv.ok) throw new Error(bobEv.error);
    expect(await as(alice, () => A.setActiveOrganizer(bobOrg.id))).toMatchObject({ ok: false });
    // cookie forjado com o id da produtora do Bob: a Alice continua na dela, sem os eventos dele
    jar.set("tw_org", bobOrg.id);
    const s = await getPainelScope(alice);
    expect(s.org?.id).toBe(aliceOrg.id);
    expect(s.events.map((e) => e.id)).not.toContain(bobEv.eventId);
    const made = await as(alice, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA Alice com cookie do Bob", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    if (!made.ok) throw new Error(made.error);
    expect((await db.query.events.findFirst({ where: eq(schema.events.id, made.eventId) }))?.organizerId).toBe(aliceOrg.id);
    expect(await as(alice, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA editando o do Bob", vis: "rascunho" }, eventId: bobEv.eventId, dbMap: bobEv.dbMap }))).toMatchObject({ ok: false });
    expect(await as(alice, () => P.inviteMember(`${qaId("x")}@example.com`, "admin"))).toMatchObject({ ok: true });
    expect(await db.query.organizerMembers.findMany({ where: eq(schema.organizerMembers.organizerId, bobOrg.id) })).toHaveLength(0);
    await db.delete(schema.organizerMembers).where(eq(schema.organizerMembers.organizerId, aliceOrg.id));
    jar.clear();
  });

  it("admin da equipe de outra produtora alterna para ela pelo mesmo seletor; quem não é produtor não cria produtora", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const A = await import("@/lib/actions/produtoras");
    const P = await import("@/lib/actions/painel");
    const { getPainelScope } = await import("@/lib/data/painel");
    jar.clear();
    const { u: dona, org: donaOrg } = await producer("dona-eq");
    const { u: outro, org: outroOrg } = await producer("produtor-admin");
    expect(await as(dona, () => P.inviteMember(outro.email, "admin"))).toMatchObject({ ok: true });
    const before = await getPainelScope(outro);
    expect(before.org?.id).toBe(outroOrg.id);
    expect(before.orgs.map((x) => [x.org.id, x.role])).toEqual([[outroOrg.id, "owner"], [donaOrg.id, "admin"]]);
    expect(await as(outro, () => A.setActiveOrganizer(donaOrg.id))).toMatchObject({ ok: true });
    const after = await getPainelScope(outro);
    expect(after.org?.id).toBe(donaOrg.id);
    expect(after.role).toBe("admin");
    jar.clear();
    const nobody = person("so-comprador");
    expect(await as(nobody, () => A.createOrganizer(null, form({ name: `Sem cadastro ${nobody.id}` })))).toMatchObject({ ok: false });
    await db.delete(schema.organizerMembers).where(eq(schema.organizerMembers.organizerId, donaOrg.id));
  });
});
