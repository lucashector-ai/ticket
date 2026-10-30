import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";
import { cpfOf } from "../load/stats";

/*
 * Abertura de vendas (achado do teste de carga, rodada 3): com muitos pedidos ao mesmo tempo pelos últimos
 * lugares, a conferência depois de gravar via TODOS os pedidos simultâneos e todos os que passavam da conta saíam
 * juntos. Resultado: sobrava lugar (50 pessoas por 30 lugares: só 21 reservas; 100 por 60: 36). Agora a trava por
 * tipo + conferência na mesma transação: os primeiros ficam com todos os lugares, sem passar da quantidade.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const als = new AsyncLocalStorage<U>();
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => als.getStore() ?? null }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [];

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("reserva justa na abertura de vendas (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("25 pessoas ao mesmo tempo por 15 lugares: as 15 reservas saem, nem uma a mais", async () => {
    const { db, schema } = D;
    const { and, eq, sum } = await import("drizzle-orm");
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA reserva justa", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
    created.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 15, maxPerOrder: 4 }).returning();
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => {
      const id = qaId(`fila${i}`); users.push(id);
      const u: U = { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true };
      return als.run(u, () => C.placeOrder({
        eventSlug: ev.slug, items: [{ ticketTypeId: tt.id, quantity: 1 }], coupon: null,
        buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: cpfOf(7000 + i) },
        holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
        method: "pix", installments: 1, groupShareId: null, resaleListingId: null,
      }));
    }));
    const [held] = await db.select({ n: sum(schema.orderItems.quantity) }).from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .where(and(eq(schema.orders.eventId, ev.id), eq(schema.orders.status, "pending")));
    expect(rs.filter((r) => r.ok).length).toBe(15);
    expect(Number(held.n)).toBe(15);
  });
});
