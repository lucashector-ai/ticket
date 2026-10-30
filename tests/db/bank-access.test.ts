import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Banco Tickets Win e a equipe: admin (ou portaria) da produtora da dona nunca vê nem mexe no banco, saldo ou saques
 * dela, nem com o seletor do painel apontando para a produtora da dona. Quem é dono de uma produtora e admin de outra
 * vê sempre o banco da SUA produtora (antes, com a outra ativa no painel, o banco ficava vazio para ele).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db");
const users: string[] = [], orgs: string[] = [];
const uid = (p: string) => { const id = qaId(p); users.push(id); return id; };

describe.skipIf(!TEST_DB)("banco: só o dono, nunca a equipe (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    jar.clear();
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (orgs.length) {
      await db.delete(schema.payoutRequests).where(inArray(schema.payoutRequests.organizerId, orgs));
      await db.delete(schema.events).where(inArray(schema.events.organizerId, orgs));
      await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
    }
  });

  it("admin só da equipe: sem banco nem saldo, mesmo com a produtora da dona ativa; dono+admin vê só o próprio", async () => {
    const { db, schema } = D;
    const B = await import("@/lib/bank");
    const dona = uid("dona-banco"), admin = uid("admin-banco"), outro = uid("dono-e-admin");
    const mk = async (owner: string, name: string) => {
      const [o] = await db.insert(schema.organizers).values({ slug: qaId("org-b"), name, ownerUserId: owner, onboarding: { kind: "festas" } as never, payout: { pixKey: `${owner}@example.com` } as never }).returning();
      orgs.push(o.id);
      await db.insert(schema.events).values({ slug: qaId("ev-b"), title: `Evento de ${name}`, status: "published", startAt: new Date(Date.now() - 10 * 864e5), organizerId: o.id, createdByUserId: owner });
      await db.insert(schema.payoutRequests).values({ userId: owner, organizerId: o.id, amountCents: 7777, status: "paid" });
      return o;
    };
    const donaOrg = await mk(dona, "Produtora da Dona (banco)");
    const outroOrg = await mk(outro, "Produtora do Outro (banco)");
    await db.insert(schema.organizerMembers).values([
      { organizerId: donaOrg.id, email: `${admin}@example.com`, role: "admin", userId: admin, acceptedAt: new Date() },
      { organizerId: donaOrg.id, email: `${outro}@example.com`, role: "admin", userId: outro, acceptedAt: new Date() },
    ]);

    // admin só da equipe, com a produtora da dona ativa no seletor
    jar.set("tw_org", donaOrg.id);
    expect(await B.walletFor(admin)).toBeNull();
    expect(await B.bankOwner(admin)).toBe(false);
    expect(await B.bankScope(admin)).toBeNull();

    // dono de outra produtora e admin da dona, com a da dona ativa: o banco é o DELE, nunca o da dona
    const w = await B.walletFor(outro);
    expect(w?.org?.id).toBe(outroOrg.id);
    expect(w?.destination).toMatchObject({ pixKey: `${outro}@example.com` });
    expect(w?.payouts.map((p) => p.organizerId)).toEqual([outroOrg.id]);
    expect(await B.bankOwner(outro)).toBe(true);

    // a dona continua vendo o dela
    jar.clear();
    expect((await B.walletFor(dona))?.org?.id).toBe(donaOrg.id);
    await db.delete(schema.organizerMembers).where((await import("drizzle-orm")).eq(schema.organizerMembers.organizerId, donaOrg.id));
  });
});
