import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Agente 06 · SEC-401 (contorno da correção do SEC-003): ao remover um admin, `rotateCheckinLinks` troca token e
 * código de todos os acessos da portaria e REENVIA o acesso novo para o e-mail gravado em cada acesso. Esse e-mail
 * pode ter sido escolhido pelo próprio admin antes de sair (createCheckinLink com qualquer e-mail). Resultado: a
 * rotação entrega o token novo a quem ela devia tirar o acesso.
 *
 * O teste afirma o comportamento SEGURO e hoje falha (`it.fails`): depois da remoção, nenhum acesso válido do
 * evento pode ser entregue a um e-mail que o ex-admin cadastrou. Ao corrigir (revogar os acessos criados pelo
 * removido, ou não reenviar para eles), vira `it`. Sem envio real: o e-mail é um dublê.
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

  it.fails("admin removido não recebe por e-mail o acesso novo da portaria que ele mesmo cadastrou antes de sair", async () => {
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
});
