import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Prioridade 2 do dono: valores alterados pelo navegador (SEC-100…). O pedido é criado pela ação de verdade
 * (placeOrder) com entradas adulteradas; o total, os descontos e os limites saem do banco, nunca do navegador.
 * Também o limite de usos do cupom (SEC-102) e o produtor reduzindo o lote com compras em andamento.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra"), F: typeof import("@/lib/payments/fulfill");
const created: string[] = [], users: string[] = [], couponIds: string[] = [];
const person = (): U => { const id = qaId("valor"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };
const FEE = 0.0799;

async function event(opts: { price?: number; quantity?: number; absorbFee?: boolean } = {}) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA valores", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off", absorbFee: !!opts.absorbFee }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: opts.price ?? 5000, quantity: opts.quantity ?? 20, maxPerOrder: 6 }).returning();
  return { ev, tt };
}
async function coupon(eventId: string | null, o: { pct?: number; maxUses?: number } = {}) {
  const code = `QA${qaId("c").slice(-8).toUpperCase()}`;
  const [c] = await D.db.insert(D.schema.coupons).values({ code, eventId, percentOff: o.pct ?? 10, maxUses: o.maxUses ?? null }).returning();
  couponIds.push(c.id);
  return c;
}
const input = (slug: string, tt: string, qty: number, u: U, extra: Record<string, unknown> = {}) => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: qty }], coupon: null as string | null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: "529.982.247-25" },
  holders: Array.from({ length: qty }, (_, i) => (i === 0 ? { ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null } : { ticketTypeId: tt, name: "Outra Pessoa", meia: false, me: false, email: `${qaId("h")}@example.com` })),
  method: "pix" as "pix" | "card" | "free", installments: 1, groupShareId: null, resaleListingId: null, ...extra,
});
const as = async <T,>(u: U, f: () => Promise<T>) => { session.user = u; try { return await f(); } finally { session.user = null; } };
const orderRow = async (id: string) => {
  const { eq } = await import("drizzle-orm");
  return D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, id), with: { items: true } });
};

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("valores do pedido vêm do servidor (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
    F = await import("@/lib/payments/fulfill");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (couponIds.length) await db.delete(schema.coupons).where(inArray(schema.coupons.id, couponIds));
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("preço, taxa e total enviados pelo navegador são ignorados", async () => {
    const { ev, tt } = await event();
    const u = person();
    const forged = input(ev.slug, tt.id, 2, u, { totalCents: 1, subtotalCents: 1, feeCents: 0, priceCents: 1, discountCents: 9999 });
    forged.items = [{ ticketTypeId: tt.id, quantity: 2, priceCents: 1, unitPriceCents: 1 } as never];
    const r = await as(u, () => C.placeOrder(forged as never));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalCents).toBe(10_000 + Math.round(10_000 * FEE));
    const o = await orderRow(r.orderId);
    expect(o?.totalCents).toBe(r.totalCents);
    expect(o?.discountCents).toBe(0);
    expect(o?.items[0]?.unitPriceCents).toBe(5000);
  });

  it("o mesmo tipo repetido em duas linhas (para escapar do limite ou do estoque) é recusado", async () => {
    const { ev, tt } = await event({ quantity: 3 });
    const u = person();
    const dup = input(ev.slug, tt.id, 4, u);
    dup.items = [{ ticketTypeId: tt.id, quantity: 2 }, { ticketTypeId: tt.id, quantity: 2 }];
    const r = await as(u, () => C.placeOrder(dup));
    expect(r.ok).toBe(false);
  });

  it("tipo de ingresso de outro evento no pedido: recusado", async () => {
    const a = await event(), b = await event({ price: 100 });
    const u = person();
    const r = await as(u, () => C.placeOrder(input(a.ev.slug, b.tt.id, 1, u)));
    expect(r.ok).toBe(false);
  });

  it("quantidade zero, negativa ou fracionada e parcelas fora da faixa: recusadas", async () => {
    const { ev, tt } = await event();
    const u = person();
    for (const quantity of [0, -1, 1.5]) {
      const bad = input(ev.slug, tt.id, 1, u);
      bad.items = [{ ticketTypeId: tt.id, quantity }];
      expect((await as(u, () => C.placeOrder(bad))).ok).toBe(false);
    }
    expect((await as(u, () => C.placeOrder(input(ev.slug, tt.id, 1, u, { method: "card", installments: 7 })))).ok).toBe(false);
  });

  it("Pix com 6 parcelas pedidas pelo navegador: 1x sem juros", async () => {
    const { ev, tt } = await event();
    const u = person();
    const r = await as(u, () => C.placeOrder(input(ev.slug, tt.id, 1, u, { installments: 6 })));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = await orderRow(r.orderId);
    expect(o?.installments).toBe(1);
    expect(o?.interestCents).toBe(0);
    expect(r.totalCents).toBe(5000 + Math.round(5000 * FEE));
  });

  it("\"grátis\" num pedido com valor: recusado (não vira pedido de R$ 0)", async () => {
    const { ev, tt } = await event();
    const u = person();
    const r = await as(u, () => C.placeOrder(input(ev.slug, tt.id, 1, u, { method: "free" })));
    expect(r.ok).toBe(false);
  });

  it("taxa absorvida pelo produtor: o comprador não paga taxa (regra do evento, não do navegador)", async () => {
    const { ev, tt } = await event({ absorbFee: true });
    const u = person();
    const r = await as(u, () => C.placeOrder(input(ev.slug, tt.id, 1, u)));
    expect(r.ok && r.totalCents).toBe(5000);
  });

  it("cupom de outro evento é recusado; cupom do evento desconta no servidor", async () => {
    const a = await event(), b = await event();
    const other = await coupon(b.ev.id, { pct: 50 });
    const mine = await coupon(a.ev.id, { pct: 10 });
    const u = person();
    const r1 = await as(u, () => C.placeOrder({ ...input(a.ev.slug, a.tt.id, 1, u), coupon: other.code }));
    expect(r1.ok).toBe(false);
    const r2 = await as(u, () => C.placeOrder({ ...input(a.ev.slug, a.tt.id, 1, u), coupon: mine.code }));
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.totalCents).toBe(4500 + Math.round(4500 * FEE));
  });

  it("SEC-102: cupom com 1 uso: o segundo pedido aberto ao mesmo tempo não leva o desconto", async () => {
    const { ev, tt } = await event();
    const c = await coupon(ev.id, { pct: 50, maxUses: 1 });
    const a = person(), b = person();
    const ra = await as(a, () => C.placeOrder({ ...input(ev.slug, tt.id, 1, a), coupon: c.code }));
    expect(ra.ok).toBe(true);
    const rb = await as(b, () => C.placeOrder({ ...input(ev.slug, tt.id, 1, b), coupon: c.code }));
    expect(rb.ok).toBe(false);
    if (!rb.ok) expect(rb.error).toMatch(/cupom esgotou/i);
    // a reserva do primeiro venceu sem pagamento: o uso volta a ficar livre
    const { eq } = await import("drizzle-orm");
    if (ra.ok) await D.db.update(D.schema.orders).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(D.schema.orders.id, ra.orderId));
    expect((await as(b, () => C.placeOrder({ ...input(ev.slug, tt.id, 1, b), coupon: c.code }))).ok).toBe(true);
  });

  it("SEC-102: cupom com 1 uso e dois pedidos abertos confirmando ao mesmo tempo: só um usa o cupom", async () => {
    const { ev, tt } = await event();
    const c = await coupon(ev.id, { pct: 50, maxUses: 1 });
    const { db, schema } = D;
    // dois pedidos com o cupom (criados antes da correção, ou depois da reserva de um vencer)
    const mk = async () => {
      const [o] = await db.insert(schema.orders).values({
        userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 5000, discountCents: 2500, totalCents: 2500, couponId: c.id, paymentMethod: "pix",
        expiresAt: new Date(Date.now() + 15 * 60_000), holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
      }).returning();
      await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 5000 });
      return o;
    };
    const [o1, o2] = await Promise.all([mk(), mk()]);
    const rs = await Promise.all([o1, o2].map((o) => F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    const { eq } = await import("drizzle-orm");
    const after = await db.query.coupons.findFirst({ where: eq(schema.coupons.id, c.id) });
    expect(after?.uses).toBe(1);
  });

  it("produtor reduz o lote com pedidos em andamento: nunca emite acima da nova quantidade", async () => {
    const { ev, tt } = await event({ quantity: 3 });
    const a = person(), b = person();
    const ra = await as(a, () => C.placeOrder(input(ev.slug, tt.id, 1, a)));
    const rb = await as(b, () => C.placeOrder(input(ev.slug, tt.id, 1, b)));
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.ticketTypes).set({ quantity: 1 }).where(eq(D.schema.ticketTypes.id, tt.id));
    const rs = await Promise.all([as(a, () => C.confirmPayment(ra.orderId)), as(b, () => C.confirmPayment(rb.orderId))]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
    const t = await D.db.query.ticketTypes.findFirst({ where: eq(D.schema.ticketTypes.id, tt.id) });
    expect(t?.sold).toBe(1);
  });
});
