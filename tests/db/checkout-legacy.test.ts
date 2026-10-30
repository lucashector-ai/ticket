import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/checkout");
const created: string[] = [];

/** Pedido no formato antigo (sem titulares), como a página /checkout/[orderId] recebia. */
async function legacyOrder(userId: string, qty: number, maxPerOrder = 6) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA checkout antigo", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 0, quantity: 10, maxPerOrder }).returning();
  const [o] = await db.insert(schema.orders).values({ userId, eventId: ev.id, status: "pending", subtotalCents: 0, totalCents: 0, expiresAt: new Date(Date.now() + 15 * 60_000) }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: qty, unitPriceCents: 0 });
  return { ev, tt, o };
}

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("checkout antigo usa a emissão única (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/checkout");
  });
  afterAll(async () => {
    session.user = null;
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("paga, emite uma vez e pedido de outra pessoa não é encontrado", async () => {
    const owner: U = { id: qaId("u"), email: "a@example.com", name: "Dono Pedido", emailVerified: true };
    const { o, ev } = await legacyOrder(owner.id, 2);
    session.user = { ...owner, id: qaId("outra") };
    expect((await C.payOrder(o.id)).error).toMatch(/não encontrado/);
    session.user = owner;
    const r = await C.payOrder(o.id);
    const again = await C.payOrder(o.id);
    session.user = null;
    expect(r.redirect).toMatch(/meus-ingressos/);
    expect(again.redirect).toMatch(/meus-ingressos/);
    const { eq } = await import("drizzle-orm");
    const tks = await D.db.query.tickets.findMany({ where: eq(D.schema.tickets.eventId, ev.id) });
    expect(tks.length).toBe(2);
  });

  it("acima do limite por pessoa é recusado (o caminho antigo não conferia)", async () => {
    const owner: U = { id: qaId("u"), email: "b@example.com", name: "Dono Pedido", emailVerified: true };
    const { o } = await legacyOrder(owner.id, 3, 2);
    session.user = owner;
    const r = await C.payOrder(o.id);
    session.user = null;
    expect(r.error).toMatch(/limite é 2/);
  });
});
