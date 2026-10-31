import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-105 (banco de teste): o editor não reduz o lote abaixo de vendidos + vagas seguradas (compras dentro dos 15 min
 * da reserva e partes de grupo em aberto). Reserva vencida não segura nada.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), S: typeof import("@/lib/criar/save"), M: typeof import("@/lib/criar/model");
const orgs: string[] = [];

describe.skipIf(!TEST_DB)("SEC-105: lote não fica abaixo de vendidos + reservados (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    S = await import("@/lib/criar/save");
    M = await import("@/lib/criar/model");
  });
  afterAll(async () => {
    if (!D || !orgs.length) return;
    const { inArray } = await import("drizzle-orm");
    const evs = await D.db.select({ id: D.schema.events.id }).from(D.schema.events).where(inArray(D.schema.events.organizerId, orgs));
    if (evs.length) {
      await D.db.delete(D.schema.orders).where(inArray(D.schema.orders.eventId, evs.map((e) => e.id)));
      await D.db.delete(D.schema.events).where(inArray(D.schema.events.id, evs.map((e) => e.id)));
    }
    await D.db.delete(D.schema.organizers).where(inArray(D.schema.organizers.id, orgs));
  });

  it("com 2 vendidos e 3 reservados agora, o lote não desce de 5; com a reserva vencida, desce até os vendidos", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const id = qaId("dona-lote");
    const user = { id, email: `${id}@example.com`, name: "Dona Lote" };
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: `QA Org ${id.slice(-6)}`, ownerUserId: id, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const day = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    const draft = (qty: string) => {
      const d = M.emptyDraft();
      d.title = "QA lote reduzido"; d.vis = "rascunho"; d.autoMeia = false;
      d.sessions = [{ id: "s1", date: day, time: "22:00", doors: "", cap: "", venue: "", city: "" }];
      d.sectors = [{ ...d.sectors[0], types: [{ ...d.sectors[0].types[0], price: "50", qty }] }];
      return d;
    };
    const first = await S.saveEventAs(user, { draft: draft("10"), eventId: null, dbMap: { sessions: {}, types: {} } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const typeId = first.dbMap.types["s1:t1"];
    expect(typeId).toBeTruthy();
    await db.update(schema.ticketTypes).set({ sold: 2 }).where(eq(schema.ticketTypes.id, typeId));
    const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: first.eventId, status: "pending", subtotalCents: 15000, totalCents: 15000, expiresAt: new Date(Date.now() + 10 * 60_000) }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: typeId, quantity: 3, unitPriceCents: 5000 });

    const low = await S.saveEventAs(user, { draft: draft("4"), eventId: first.eventId, dbMap: first.dbMap });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error).toMatch(/3 ingressos reservados/);
    expect((await db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, typeId) }))?.quantity).toBe(10);
    expect((await S.saveEventAs(user, { draft: draft("5"), eventId: first.eventId, dbMap: first.dbMap })).ok).toBe(true);

    // a reserva vence: os 3 lugares voltam a ser do produtor
    await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.orders.id, o.id));
    expect((await S.saveEventAs(user, { draft: draft("2"), eventId: first.eventId, dbMap: first.dbMap })).ok).toBe(true);
  });
});
