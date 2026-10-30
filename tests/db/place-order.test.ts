import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// fora de uma requisição: sem cookies (sem fila, pré-venda nem parceiro) e sem cabeçalhos
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [];
const person = (): U => { const id = qaId("comprador"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

async function event(quantity: number, maxPerOrder = 6) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA placeOrder", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity, maxPerOrder }).returning();
  return { ev, tt };
}
const input = (slug: string, tt: string, qty: number, u: U) => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: qty }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: "529.982.247-25" },
  holders: Array.from({ length: qty }, (_, i) => (i === 0 ? { ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null } : { ticketTypeId: tt, name: "Outra Pessoa", meia: false, me: false, email: `${qaId("h")}@example.com` })),
  method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null,
});

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("placeOrder: reserva e valores no servidor (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("total calculado no servidor: R$ 50 × 2 + 7,99% = R$ 107,99", async () => {
    const { ev, tt } = await event(10);
    const u = person(); session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, 2, u));
    session.user = null;
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalCents).toBe(10_799);
  });

  it("último lugar reservado por uma pessoa: a outra não consegue reservar; a própria pessoa refaz o pedido", async () => {
    const { ev, tt } = await event(1);
    const a = person(), b = person();
    session.user = a;
    expect((await C.placeOrder(input(ev.slug, tt.id, 1, a))).ok).toBe(true);
    session.user = b;
    const rb = await C.placeOrder(input(ev.slug, tt.id, 1, b));
    expect(rb.ok).toBe(false);
    if (!rb.ok) expect(rb.error).toMatch(/Restam só 0/);
    session.user = a;
    expect((await C.placeOrder({ ...input(ev.slug, tt.id, 1, a), method: "card" })).ok).toBe(true);
    session.user = null;
  });

  it("dois ao mesmo tempo pelo último: no máximo um pedido fica aberto", async () => {
    const { ev, tt } = await event(1);
    const a = person(), b = person();
    // a sessão simulada é uma só; cada chamada pega o usuário no começo
    const call = async (u: U) => { session.user = u; return C.placeOrder(input(ev.slug, tt.id, 1, u)); };
    const [ra, rb] = await Promise.all([call(a), call(b)]);
    session.user = null;
    const { and, eq } = await import("drizzle-orm");
    const open = await D.db.query.orders.findMany({ where: and(eq(D.schema.orders.eventId, ev.id), eq(D.schema.orders.status, "pending")) });
    expect(open.length).toBeLessThanOrEqual(1);
    expect([ra, rb].filter((r) => r.ok).length).toBe(open.length);
  });

  it("acima do limite por pessoa do tipo: recusado no servidor", async () => {
    const { ev, tt } = await event(10, 2);
    const u = person(); session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, 3, u));
    session.user = null;
    expect(r.ok).toBe(false);
  });
});
