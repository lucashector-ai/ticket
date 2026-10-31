import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Prioridade 5 do dono: nunca vender acima da lotação, também na parte de grupo (SEC-104). A vaga segurada pelo
 * grupo entrava "direto" na confirmação, sem conferir a lotação: com o lote reduzido pelo produtor depois de o
 * grupo segurar as vagas (ou o grupo vencendo/cancelado no meio da confirmação), vendia acima da quantidade.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill");
const created: string[] = [];

async function setup(quantity: number, shares: number) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA lotação grupo", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity, maxPerOrder: 6 }).returning();
  const [g] = await db.insert(schema.groupOrders).values({ code: qaId("g").slice(-16), eventId: ev.id, leaderUserId: qaId("lider"), expiresAt: new Date(Date.now() + 3600_000) }).returning();
  const users = Array.from({ length: shares }, () => qaId("amigo"));
  const rows = await db.insert(schema.groupShares).values(users.map((u, i) => ({ groupId: g.id, ticketTypeId: tt.id, priceCents: 5000, sortOrder: i, userId: u, name: "Pessoa Teste", claimedAt: new Date() }))).returning();
  const orders = [];
  for (const [i, sh] of rows.entries()) {
    const [o] = await db.insert(schema.orders).values({
      userId: users[i], eventId: ev.id, status: "pending", subtotalCents: 5000, totalCents: 5000, paymentMethod: "pix",
      expiresAt: new Date(Date.now() + 15 * 60_000), groupShareId: sh.id, holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 5000 });
    orders.push(o);
  }
  return { ev, tt, g, orders };
}
const soldOf = async (id: string) => {
  const { eq } = await import("drizzle-orm");
  return (await D.db.query.ticketTypes.findFirst({ where: eq(D.schema.ticketTypes.id, id) }))!;
};

describe.skipIf(!TEST_DB)("lotação com partes de grupo (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.groupOrders).where(inArray(schema.groupOrders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("grupo com as vagas seguradas: as partes pagas entram normalmente", async () => {
    const { tt, orders } = await setup(2, 2);
    const rs = await Promise.all(orders.map((o) => F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })));
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await soldOf(tt.id)).sold).toBe(2);
  });

  it("produtor reduz o lote abaixo das vagas do grupo: as partes não passam da nova quantidade", async () => {
    const { tt, orders } = await setup(3, 3);
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.ticketTypes).set({ quantity: 1 }).where(eq(D.schema.ticketTypes.id, tt.id));
    const rs = await Promise.all(orders.map((o) => F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })));
    const t = await soldOf(tt.id);
    expect(t.sold).toBeLessThanOrEqual(t.quantity);
    expect(rs.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
  });

  it("grupo cancelado e vagas vendidas a outros: a parte paga depois não passa da lotação", async () => {
    const { tt, g, orders } = await setup(2, 2);
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.groupOrders).set({ status: "cancelled" }).where(eq(D.schema.groupOrders.id, g.id));
    await D.db.update(D.schema.ticketTypes).set({ sold: 2 }).where(eq(D.schema.ticketTypes.id, tt.id));
    const r = await F.fulfillOrder(orders[0].id, { ref: `TEST-${orders[0].number}`, charged: false });
    expect(r.ok).toBe(false);
    expect((await soldOf(tt.id)).sold).toBe(2);
  });
});
