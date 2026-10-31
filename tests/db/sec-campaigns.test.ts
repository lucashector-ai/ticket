import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-304 / SEC-010 (banco de teste): e-mail marketing e envio de teste só para produtor com e-mail confirmado, com
 * limite de testes; conta sem produtora não tem painel. Nenhum e-mail sai: o envio é simulado.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
const sent: string[] = [];
vi.mock("@/lib/mail/send", () => ({
  sendTestEmail: async (_c: unknown, to: string) => { sent.push(to); return { ok: true }; },
  queueCampaign: async () => ({ ok: true }), processEmailQueue: async () => {},
}));

let D: typeof import("@/db"), E: typeof import("@/lib/actions/emails");
const users: string[] = [], orgs: string[] = [];
const person = (p: string, verified = true): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: verified }; };
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };

describe.skipIf(!TEST_DB)("SEC-304/SEC-010: e-mail marketing só para produtor confirmado (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    E = await import("@/lib/actions/emails");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (users.length) {
      await db.delete(schema.emailCampaigns).where(inArray(schema.emailCampaigns.userId, users));
      await db.delete(schema.securityEvents).where(inArray(schema.securityEvents.userId, users));
    }
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  it("conta qualquer (sem produtora): não cria campanha nem tem painel", async () => {
    const u = person("curioso");
    expect(await as(u, () => E.createCampaign("branco" as never, ""))).toEqual({ ok: false, error: "Sem permissão." });
    const { painelAccess } = await import("@/lib/painel/access");
    await expect(as(u, () => painelAccess("admin"))).rejects.toThrow("REDIRECT /criar-evento");
  });

  it("produtora sem e-mail confirmado: não cria campanha (e-mail de teste não sai)", async () => {
    const { db, schema } = D;
    const u = person("prod-nao-confirmada", false);
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: `QA Org ${u.id.slice(-6)}`, ownerUserId: u.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    expect((await as(u, () => E.createCampaign("branco" as never, ""))).ok).toBe(false);
  });

  it("produtora confirmada: cria campanha e manda até 5 testes por hora nela (o 6º é recusado)", async () => {
    const { db, schema } = D;
    const u = person("prod-ok");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: `QA Org ${u.id.slice(-6)}`, ownerUserId: u.id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const c = await as(u, () => E.createCampaign("branco" as never, ""));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    sent.length = 0;
    const r = await Promise.all(Array.from({ length: 8 }, () => as(u, () => E.sendTest(c.id))));
    expect(r.filter((x) => x.ok)).toHaveLength(5);
    expect(r.find((x) => !x.ok)).toEqual({ ok: false, error: "Muitos e-mails de teste. Tente de novo mais tarde." });
    expect(sent).toHaveLength(5);
  });
});
