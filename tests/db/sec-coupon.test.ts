import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaCpf, qaId, TEST_DB } from "./setup";

/*
 * SEC-307 / SEC-008 (banco de teste): o pedido não serve para testar cupons sem limite e a resposta não revela que um
 * código existe em outro evento (ou venceu). KV simulado em memória.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ "cf-connecting-ip": "203.0.113.77" }) }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [], couponIds: string[] = [];
const person = (): U => { const id = qaId("cupom"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };
async function event() {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA cupom", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 50, maxPerOrder: 4 }).returning();
  return { ev, tt };
}
const input = (slug: string, tt: string, u: U, coupon: string) => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: 1 }], coupon,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: qaCpf() },
  holders: [{ ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null }],
  method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null,
});
const place = async (u: U, i: ReturnType<typeof input>) => { session.user = u; try { return await C.placeOrder(i); } finally { session.user = null; } };

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("SEC-307/SEC-008: cupom no pedido (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (couponIds.length) await db.delete(schema.coupons).where(inArray(schema.coupons.id, couponIds));
    if (created.length) {
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("cupom de outro evento e cupom vencido respondem igual a cupom inexistente", async () => {
    const a = await event(), b = await event();
    const code = `QA${qaId("c").slice(-6).toUpperCase()}`, old = `QV${qaId("c").slice(-6).toUpperCase()}`;
    const rows = await D.db.insert(D.schema.coupons).values([
      { code, eventId: b.ev.id, percentOff: 50 },
      { code: old, eventId: a.ev.id, percentOff: 50, expiresAt: new Date(Date.now() - 864e5) },
    ]).returning();
    couponIds.push(...rows.map((r) => r.id));
    const u = person();
    const other = await place(u, input(a.ev.slug, a.tt.id, u, code));
    const expired = await place(u, input(a.ev.slug, a.tt.id, u, old));
    const none = await place(u, input(a.ev.slug, a.tt.id, u, "NAOEXISTE123"));
    expect(other).toEqual({ ok: false, error: "Cupom inválido ou expirado." });
    expect(expired).toEqual(other);
    expect(none).toEqual(other);
    expect((await C.checkCoupon(code, a.ev.slug))).toEqual({ ok: false, error: "Cupom inválido ou expirado." });
  });

  it("10 cupons errados no pedido por conta: o 11º é recusado pelo freio (sem conferir o código)", async () => {
    kv.clear();
    const { ev, tt } = await event();
    const u = person();
    const r = [];
    for (let i = 0; i < 11; i++) r.push(await place(u, input(ev.slug, tt.id, u, `CHUTE${i}`)));
    expect(r.slice(0, 10).every((x) => !x.ok && x.error === "Cupom inválido ou expirado.")).toBe(true);
    expect(r[10]).toEqual({ ok: false, error: "Muitas tentativas de cupom. Espere alguns minutos e tente de novo." });
  });
});
