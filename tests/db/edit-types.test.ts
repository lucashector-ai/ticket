import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

type Db = typeof import("@/db");
let D: Db, S: typeof import("@/lib/criar/save");
const created: string[] = [];

async function setup(orderStatus: "expired" | "cancelled" | "pending" | null, expiresInMs = -60_000) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA editar tipos", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Lote velho", priceCents: 5000, quantity: 10 }).returning();
  if (orderStatus) {
    const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: orderStatus, subtotalCents: 5000, totalCents: 5000, expiresAt: new Date(Date.now() + expiresInMs) }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 5000 });
  }
  return { ev, tt };
}

describe.skipIf(!TEST_DB)("editar evento: apagar tipo de ingresso (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    S = await import("@/lib/criar/save");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("tipo só em carrinho abandonado: libera e o apagar não bate na chave estrangeira", async () => {
    const { tt } = await setup("expired");
    const r = await S.dropBlockers([tt]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { db, schema } = D;
    const { and, eq, inArray } = await import("drizzle-orm");
    await db.delete(schema.orderItems).where(and(eq(schema.orderItems.ticketTypeId, tt.id), inArray(schema.orderItems.orderId, r.deadOrderIds)));
    await expect(db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, tt.id))).resolves.toBeDefined();
  });

  it("sem a limpeza, o apagar quebrava (era o erro no meio da gravação)", async () => {
    const { tt } = await setup("cancelled");
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    await expect(db.delete(schema.ticketTypes).where(eq(schema.ticketTypes.id, tt.id))).rejects.toThrow();
  });

  it("alguém pagando agora: bloqueia com aviso", async () => {
    const { tt } = await setup("pending", 10 * 60_000);
    const r = await S.dropBlockers([tt]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/comprando/);
  });

  it("tipo com ingresso emitido (mesmo reembolsado): bloqueia", async () => {
    const { ev, tt } = await setup(null);
    const { db, schema } = D;
    const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: "refunded", subtotalCents: 5000, totalCents: 5000 }).returning();
    await db.insert(schema.tickets).values({ code: `TW-${qaId("x").slice(-8, -4).toUpperCase()}-${qaId("y").slice(-4).toUpperCase()}`, orderId: o.id, eventId: ev.id, ticketTypeId: tt.id, holderUserId: "qa", secret: "x".repeat(32), status: "refunded" });
    const r = await S.dropBlockers([tt]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/emitidos/);
  });
});
