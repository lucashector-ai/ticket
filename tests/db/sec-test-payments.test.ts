import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-100 (banco de teste): no site de produção sem a chave da Stripe e sem ALLOW_TEST_PAYMENTS=1, pedido com
 * valor não é reservado nem confirmado pelo "Já fiz o pagamento"; ingresso grátis continua saindo na hora.
 * Fora da produção (como o local e os outros testes) o modo de teste continua igual.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra"), K: typeof import("@/lib/actions/checkout");
const created: string[] = [], users: string[] = [];
const person = (): U => { const id = qaId("comprador"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

async function event(priceCents: number) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA modo de teste", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents, quantity: 10, maxPerOrder: 4 }).returning();
  return { ev, tt };
}
const input = (slug: string, tt: string, u: U, method: "pix" | "free") => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: 1 }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: "529.982.247-25" },
  holders: [{ ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null }],
  method, installments: 1, groupShareId: null, resaleListingId: null,
});
const production = () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ticketswin.com.br");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("ALLOW_TEST_PAYMENTS", "");
};

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("SEC-100: modo de teste de pagamento só onde foi liberado (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
    K = await import("@/lib/actions/checkout");
  });
  afterEach(() => { vi.unstubAllEnvs(); session.user = null; });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      const ord = await db.select({ id: schema.orders.id }).from(schema.orders).where(inArray(schema.orders.eventId, created));
      if (ord.length) await db.delete(schema.tickets).where(inArray(schema.tickets.orderId, ord.map((o) => o.id)));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("produção sem chave: pedido pago não reserva e mostra 'Pagamento indisponível no momento'", async () => {
    const { ev, tt } = await event(5000);
    const u = person();
    production();
    session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, u, "pix"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/^Pagamento indisponível no momento/);
      expect(r.error).not.toMatch(/stripe/i);
    }
    const { eq } = await import("drizzle-orm");
    expect(await D.db.query.orders.findMany({ where: eq(D.schema.orders.eventId, ev.id) })).toHaveLength(0);
  });

  it("produção sem chave: pedido pago já aberto não é confirmado pelo 'Já fiz o pagamento' (nem pela página antiga)", async () => {
    const { ev, tt } = await event(5000);
    const u = person();
    session.user = u;
    // criado fora da produção (ex.: antes da publicação), confirmado depois na produção
    const r = await C.placeOrder(input(ev.slug, tt.id, u, "pix"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    production();
    const c = await C.confirmPayment(r.orderId);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toMatch(/^Pagamento indisponível no momento/);
    const k = await K.payOrder(r.orderId);
    expect(k.redirect).toBeUndefined();
    expect(k.error).toMatch(/^Pagamento indisponível no momento/);
    const { eq } = await import("drizzle-orm");
    const o = await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, r.orderId) });
    expect(o?.status).toBe("pending");
    expect(await D.db.query.tickets.findMany({ where: eq(D.schema.tickets.orderId, r.orderId) })).toHaveLength(0);
  });

  it("produção sem chave: ingresso grátis continua saindo na hora", async () => {
    const { ev, tt } = await event(0);
    const u = person();
    production();
    session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, u, "free"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await C.confirmPayment(r.orderId);
    expect(c.ok).toBe(true);
  });

  it("produção sem chave com ALLOW_TEST_PAYMENTS=1: o modo de teste volta (decisão explícita do dono)", async () => {
    const { ev, tt } = await event(5000);
    const u = person();
    production();
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "1");
    session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, u, "pix"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await C.confirmPayment(r.orderId);
    expect(c.ok).toBe(true);
  });
});
