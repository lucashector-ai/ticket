import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill"), R: typeof import("@/lib/payments/refund");
const created: string[] = [];

describe.skipIf(!TEST_DB)("reembolso repetido (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    R = await import("@/lib/payments/refund");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.orderRefunds).where(inArray(schema.orderRefunds.eventId, created));
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("dois \"reembolsar tudo\" ao mesmo tempo: devolve uma vez e o estoque volta uma vez", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA reembolso", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
    created.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 10 }).returning();
    const [o] = await db.insert(schema.orders).values({
      userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 10_000, feeCents: 799, totalCents: 10_799, paymentMethod: "pix",
      expiresAt: new Date(Date.now() + 15 * 60_000), holders: [0, 1].map(() => ({ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null })),
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 2, unitPriceCents: 5000, unitFeeCents: 400 });
    expect((await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })).ok).toBe(true);
    const actor = { userId: null, name: "Teste" };
    const rs = await Promise.all([0, 1, 2].map(() => R.refundTickets({ orderId: o.id, ticketIds: "all", kind: "order", actor, mail: "none", allowCheckedIn: true })));
    const rows = await db.query.orderRefunds.findMany({ where: eq(schema.orderRefunds.orderId, o.id) });
    const tt2 = await db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, tt.id) });
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, o.id) });
    const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.orderId, o.id) });
    expect(rows.filter((r) => r.status !== "failed").length).toBe(1);
    expect(rows.reduce((s, r) => s + (r.status === "failed" ? 0 : r.amountCents), 0)).toBe(10_799);
    expect(tt2?.sold).toBe(0);
    expect(order?.status).toBe("refunded");
    expect(tks.every((t) => t.status === "refunded")).toBe(true);
    expect(rs.some((r) => r.ok)).toBe(true);
  });
});
