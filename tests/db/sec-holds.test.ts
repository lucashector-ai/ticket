import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-305 (banco de teste): reserva sem pagar. Uma conta não segura pedidos em muitos eventos ao mesmo tempo e um CPF
 * não segura o mesmo evento em várias contas. A compra normal (inclusive trocar a forma de pagamento) continua igual.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [];
const person = (): U => { const id = qaId("reserva"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

async function event() {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA reservas", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 50, maxPerOrder: 4 }).returning();
  return { ev, tt };
}
const input = (slug: string, tt: string, u: U, cpf = "529.982.247-25") => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: 1 }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf },
  holders: [{ ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null }],
  method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null,
});
const place = async (u: U, i: ReturnType<typeof input>) => { session.user = u; try { return await C.placeOrder(i); } finally { session.user = null; } };

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("SEC-305: reservas sem pagar (banco de teste)", () => {
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

  it("uma conta segura pedidos em até 3 eventos ao mesmo tempo; o 4º espera (refazer no mesmo evento continua)", async () => {
    const u = person();
    const evs = [await event(), await event(), await event(), await event()];
    for (let i = 0; i < 3; i++) expect((await place(u, input(evs[i].ev.slug, evs[i].tt.id, u))).ok).toBe(true);
    const fourth = await place(u, input(evs[3].ev.slug, evs[3].tt.id, u));
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error).toMatch(/compras em andamento em outros eventos/);
    // trocar a forma de pagamento no mesmo evento: o pedido anterior é liberado e o novo entra
    expect((await place(u, { ...input(evs[0].ev.slug, evs[0].tt.id, u), method: "card" as never })).ok).toBe(true);
  });

  it("o mesmo CPF não segura o mesmo evento em duas contas; outro CPF e outro evento passam", async () => {
    const a = person(), b = person();
    const { ev, tt } = await event();
    expect((await place(a, input(ev.slug, tt.id, a))).ok).toBe(true);
    const same = await place(b, input(ev.slug, tt.id, b));
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.error).toMatch(/com este CPF/);
    expect((await place(b, input(ev.slug, tt.id, b, "111.444.777-35"))).ok).toBe(true);
    const other = await event();
    expect((await place(person(), input(other.ev.slug, other.tt.id, b))).ok).toBe(true);
  });
});
