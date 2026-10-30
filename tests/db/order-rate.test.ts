import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * d72c91c / f3f288f: cada pedido segura os ingressos por 15 min, então criar pedidos em sequência viraria um
 * jeito de travar o estoque. Limite: 12 pedidos criados por conta a cada 10 min; erro de preenchimento não conta.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [];

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("limite de pedidos por conta (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    session.user = null;
    if (!D || !created.length) return;
    const { inArray } = await import("drizzle-orm");
    await D.db.delete(D.schema.orders).where(inArray(D.schema.orders.eventId, created));
    await D.db.delete(D.schema.events).where(inArray(D.schema.events.id, created));
  });

  it("12 pedidos em 10 min passam, o 13º é recusado; erro de preenchimento não gasta a cota; outra conta não é afetada", async () => {
    const [ev] = await D.db.insert(D.schema.events).values({ slug: qaId("ev"), title: "QA limite de pedidos", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
    created.push(ev.id);
    const [tt] = await D.db.insert(D.schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 100, maxPerOrder: 6 }).returning();
    const id = qaId("comprador");
    const u: U = { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true };
    const input = (cpf = "529.982.247-25") => ({
      eventSlug: ev.slug, items: [{ ticketTypeId: tt.id, quantity: 1 }], coupon: null,
      buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf },
      holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
      method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null,
    });
    session.user = u;
    // CPF inválido: recusado antes de criar o pedido, não conta
    for (let i = 0; i < 3; i++) expect((await C.placeOrder(input("111.111.111-11"))).ok).toBe(false);
    const rs = [];
    for (let i = 0; i < 13; i++) rs.push(await C.placeOrder(input()));
    expect(rs.slice(0, 12).every((r) => r.ok)).toBe(true);
    expect(rs[12]).toMatchObject({ ok: false, error: "Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo." });
    const other = qaId("outra");
    session.user = { ...u, id: other, email: `${other}@example.com` };
    expect((await C.placeOrder({ ...input(), buyer: { ...input().buyer, email: `${other}@example.com` } })).ok).toBe(true);
    session.user = null;
  }, 120_000);
});
