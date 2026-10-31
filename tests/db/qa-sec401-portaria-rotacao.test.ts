import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Agente 06 · SEC-401 (contorno da correção do SEC-003): ao remover um admin, `rotateCheckinLinks` troca token e
 * código de todos os acessos da portaria e REENVIA o acesso novo para o e-mail gravado em cada acesso. Esse e-mail
 * pode ter sido escolhido pelo próprio admin antes de sair (createCheckinLink com qualquer e-mail). Resultado: a
 * rotação entrega o token novo a quem ela devia tirar o acesso.
 *
 * O teste afirma o comportamento SEGURO: depois da remoção, nenhum acesso válido do evento pode ser entregue a um
 * e-mail que o ex-admin cadastrou. Era `it.fails`; com a correção (Agente 03, rodada 2: os acessos criados pelo
 * removido são desligados e nada é reenviado sozinho) virou `it`. Sem envio real: o e-mail é um dublê.
 */
const sent = vi.hoisted(() => [] as { email: string; token: string; code: string }[]);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { void fn(); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/notify", async (orig) => ({
  ...(await orig<typeof import("@/lib/notify")>()),
  mailPortariaAccess: async (p: { email: string; token: string; code: string }) => { sent.push({ email: p.email, token: p.token, code: p.code }); return true; },
  mailTeamInvite: async () => true,
  mailSecurityNotice: async () => true,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user, requireUser: async () => session.user }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { KV: { get: async () => null, put: async () => {}, delete: async () => {} } } }) }));

let D: typeof import("@/db");
const users: string[] = [], orgs: string[] = [];
const person = (p: string): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: true }; };
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };

describe.skipIf(!TEST_DB)("Agente 06 · SEC-401: rotação do SEC-003 x acesso com e-mail escolhido pelo admin (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (orgs.length) {
      await db.delete(schema.events).where(inArray(schema.events.organizerId, orgs));
      await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
    }
  });

  it("admin removido não recebe por e-mail o acesso novo da portaria que ele mesmo cadastrou antes de sair", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const { activeAccess } = await import("@/lib/portaria");
    const owner = person("dona401"), admin = person("admin401");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA 401", ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA 401", status: "published", startAt: new Date(Date.now() + 5 * 864e5), organizerId: org.id, createdByUserId: owner.id }).returning();
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    // antes de sair, o admin cria um acesso "da equipe da porta" com um e-mail que ele controla (sem enviar agora)
    const outside = `${qaId("fora")}@example.com`;
    const link = await as(admin, () => P.createCheckinLink(ev.id, "Porta lateral", outside, false));
    if (!link.ok) throw new Error(link.error);
    const m = await db.query.organizerMembers.findFirst({ where: eq(schema.organizerMembers.organizerId, org.id) });
    sent.length = 0;
    expect(await as(owner, () => P.removeMember(m!.id))).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 300));
    const now = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, link.id) });
    const leaked = sent.filter((s) => s.email === outside);
    const leakedStillOpens = leaked.length ? !!(await activeAccess({ token: leaked[0].token })) : false;
    console.log("[SEC-401]", JSON.stringify({ acessoDesligado: !!now?.revokedAt, tokenTrocado: now?.token !== link.token, reenviadoParaEmailDoExAdmin: leaked.length, tokenReenviadoAbre: leakedStillOpens }));
    // seguro: ou o acesso criado por ele foi desligado, ou nada válido foi entregue ao e-mail dele
    expect(leakedStillOpens).toBe(false);
  });

  async function setup(tag: string) {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const owner = person(`dona${tag}`), admin = person(`admin${tag}`);
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: `Produtora QA ${tag}`, ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: `QA ${tag}`, status: "published", startAt: new Date(Date.now() + 5 * 864e5), organizerId: org.id, createdByUserId: owner.id }).returning();
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    const { getPainelScope } = await import("@/lib/data/painel");
    await getPainelScope(admin); // aceita o convite (liga o user_id), como no primeiro acesso ao painel
    const m = await db.query.organizerMembers.findFirst({ where: eq(schema.organizerMembers.organizerId, org.id) });
    return { P, owner, admin, org, ev, member: m! };
  }

  it("Agente 03 (SEC-401): rebaixar o admin desliga os acessos que ele criou; o acesso da dona troca e não é reenviado sozinho", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { activeAccess } = await import("@/lib/portaria");
    const { P, owner, admin, ev, member } = await setup("401b");
    const mine = `${qaId("maria")}@example.com`, his = `${qaId("dele")}@example.com`;
    const ownerLink = await as(owner, () => P.createCheckinLink(ev.id, "Maria", mine, false));
    const adminLink = await as(admin, () => P.createCheckinLink(ev.id, "Porta lateral", his, false));
    if (!ownerLink.ok || !adminLink.ok) throw new Error("sem acesso");
    await db.update(schema.checkinLinks).set({ sentAt: new Date() }).where(eq(schema.checkinLinks.id, ownerLink.id));
    sent.length = 0;
    const r = await as(owner, () => P.setMemberRole(member.id, "portaria"));
    expect(r).toMatchObject({ ok: true, revoked: 1, rotated: 1 });
    await new Promise((res) => setTimeout(res, 300));
    expect(sent).toHaveLength(0);
    // o criado pelo admin cai de vez, até para o aparelho já conectado
    expect(await activeAccess({ id: adminLink.id })).toBeNull();
    // o da dona: token e código novos, aparelho conectado continua, e-mail guardado para a dona reenviar
    expect(await activeAccess({ token: ownerLink.token })).toBeNull();
    expect(await activeAccess({ id: ownerLink.id })).toBeTruthy();
    const now = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, ownerLink.id) });
    expect(now).toMatchObject({ email: mine, sentAt: null, revokedAt: null });
    expect(await as(owner, () => P.sendCheckinLink(ownerLink.id, mine))).toMatchObject({ ok: true });
    expect(sent.map((x) => x.email)).toEqual([mine]);
    expect(await activeAccess({ token: sent[0].token })).toBeTruthy();
  });

  it("Agente 03 (SEC-401): admin não manda o acesso de outra pessoa para um e-mail diferente do gravado; a dona pode", async () => {
    const { P, owner, admin, ev } = await setup("401c");
    const mine = `${qaId("maria")}@example.com`, his = `${qaId("dele")}@example.com`;
    const ownerLink = await as(owner, () => P.createCheckinLink(ev.id, "Maria", mine, false));
    const blank = await as(owner, () => P.createCheckinLink(ev.id, "Portão B"));
    const own = await as(admin, () => P.createCheckinLink(ev.id, "Porta lateral", his, false));
    if (!ownerLink.ok || !blank.ok || !own.ok) throw new Error("sem acesso");
    sent.length = 0;
    expect(await as(admin, () => P.sendCheckinLink(ownerLink.id, his))).toMatchObject({ ok: false });
    expect(await as(admin, () => P.sendCheckinLink(ownerLink.id, mine))).toMatchObject({ ok: true });
    expect(await as(admin, () => P.sendCheckinLink(blank.id, his))).toMatchObject({ ok: true }); // sem e-mail ainda: pode definir
    expect(await as(admin, () => P.sendCheckinLink(own.id, `${qaId("outro")}@example.com`))).toMatchObject({ ok: true }); // o próprio
    const other = `${qaId("nova")}@example.com`;
    expect(await as(owner, () => P.sendCheckinLink(ownerLink.id, other))).toMatchObject({ ok: true });
    expect(sent.map((x) => x.email)).not.toContain(undefined);
    expect(sent.filter((x) => x.email === his)).toHaveLength(1);
  });
});
