import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * D-01 (decisão do dono): partes de grupo não contam para o limite por pessoa, então
 *   (a) cada conta paga no máximo uma parte de cada grupo;
 *   (c) cada conta tem no máximo um grupo aberto por evento.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill"), G: typeof import("@/lib/actions/grupo"), S: typeof import("@/lib/special");
const created: string[] = [];
const person = (): U => { const id = qaId("lider"); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

async function event(quantity = 20) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA grupo", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity, maxPerOrder: 2 }).returning();
  return { ev, tt };
}

/** Grupo de `n` partes já com as partes seguradas pela mesma conta (como se ela tivesse aberto duas abas antes da regra). */
async function groupWithShares(eventId: string, ticketTypeId: string, n: number, userId: string) {
  const { db, schema } = D;
  const [g] = await db.insert(schema.groupOrders).values({ code: qaId("g").slice(-16), eventId, leaderUserId: qaId("outro"), expiresAt: new Date(Date.now() + 3600_000) }).returning();
  const shares = await db.insert(schema.groupShares).values(Array.from({ length: n }, (_, i) => ({
    groupId: g.id, ticketTypeId, priceCents: 5000, sortOrder: i, userId, name: "Pessoa Teste", claimedAt: new Date(),
  }))).returning();
  return { g, shares };
}

async function shareOrder(eventId: string, ticketTypeId: string, shareId: string, userId: string) {
  const { db, schema } = D;
  const [o] = await db.insert(schema.orders).values({
    userId, eventId, status: "pending", subtotalCents: 5000, feeCents: 0, totalCents: 5000, paymentMethod: "pix",
    expiresAt: new Date(Date.now() + 15 * 60_000), groupShareId: shareId,
    holders: [{ ticketTypeId, name: "Pessoa Teste", meia: false, me: true, email: null }],
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId, quantity: 1, unitPriceCents: 5000, unitFeeCents: 0 });
  return o;
}

describe.skipIf(!TEST_DB)("compra em grupo × limite por pessoa (D-01, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    G = await import("@/lib/actions/grupo");
    S = await import("@/lib/special");
  });
  afterAll(async () => {
    session.user = null;
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.groupOrders).where(inArray(schema.groupOrders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("(a) a mesma conta pagando duas partes do grupo ao mesmo tempo: só uma passa", async () => {
    const { ev, tt } = await event();
    const userId = qaId("amigo");
    const { shares } = await groupWithShares(ev.id, tt.id, 2, userId);
    const os = await Promise.all(shares.map((s) => shareOrder(ev.id, tt.id, s.id, userId)));
    const rs = await Promise.all(os.map((o) => F.fulfillOrder(o.id, { ref: `TEST-g-${o.number}`, charged: false })));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const paid = await D.db.query.groupShares.findMany({ where: and(eq(D.schema.groupShares.userId, userId), isNotNull(D.schema.groupShares.paidAt)) });
    expect(paid.length).toBe(1);
  });

  it("(a) depois de pagar uma parte, a mesma conta não segura outra parte do grupo", async () => {
    const { ev, tt } = await event();
    const userId = qaId("amigo");
    const { g, shares } = await groupWithShares(ev.id, tt.id, 1, userId);
    // uma vaga livre no mesmo grupo (antes de pagar: com todas pagas o grupo fecha)
    const [free] = await D.db.insert(D.schema.groupShares).values({ groupId: g.id, ticketTypeId: tt.id, priceCents: 5000, sortOrder: 9 }).returning();
    const o = await shareOrder(ev.id, tt.id, shares[0].id, userId);
    expect(await F.fulfillOrder(o.id, { ref: "TEST-g1", charged: false })).toMatchObject({ ok: true });
    const look = await S.lookupSpecial(ev.id, { groupShareId: free.id }, userId);
    expect(look.ok).toBe(false);
    if (!look.ok) expect(look.error).toBe(S.ONE_SHARE);
    const claimed = await S.claimSpecial({ kind: "grupo", shareId: free.id, groupId: g.id, groupCode: g.code, ticketTypeId: tt.id, priceCents: 5000, slot: 2, slots: 2 }, userId, "Pessoa Teste");
    expect(claimed).toBe(false);
    // outra conta pega a vaga normalmente
    expect((await S.lookupSpecial(ev.id, { groupShareId: free.id }, qaId("outra"))).ok).toBe(true);
  });

  it("(c) um grupo aberto por pessoa em cada evento, também com dois pedidos no mesmo instante", async () => {
    const { ev, tt } = await event();
    const u = person();
    session.user = u;
    const input = { eventSlug: ev.slug, items: [{ ticketTypeId: tt.id, quantity: 2 }] };
    const both = await Promise.all([G.createGroup(input), G.createGroup(input)]);
    expect(both.filter((r) => r.ok).length).toBe(1);
    const again = await G.createGroup(input);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/já tem um grupo aberto/);
    // cancelou o grupo: pode montar outro
    const code = both.find((r) => r.ok);
    if (code?.ok) expect((await G.cancelGroup(code.code)).ok).toBe(true);
    expect((await G.createGroup(input)).ok).toBe(true);
    session.user = null;
  });
});
