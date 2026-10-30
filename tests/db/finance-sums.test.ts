import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Financeiro e extrato do Banco agregados no banco (orderSums) em vez de trazer pedido por pedido:
 * o resultado tem de ser idêntico ao cálculo antigo (listOrders + soma no servidor), centavo por centavo,
 * com taxa absorvida (arredondada pedido a pedido), meia, cupom, venda de teste, revenda e reembolso.
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), P: typeof import("@/lib/data/painel"), B: typeof import("@/lib/bank");
const orgs: string[] = [], evs: string[] = [];

/** O cálculo de antes (extrato do Banco), a partir dos pedidos um a um. */
async function walletBefore(evIds: string[], absorb: Map<string, boolean>, refunded: Set<string>) {
  const orders = (await P.listOrders(evIds, absorb)).filter((o) => o.status === "paid" || refunded.has(o.id));
  const real = orders.filter((o) => !o.test && o.net > 0);
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const groups = new Map<string, { net: number; n: number; qty: number; at: string }>();
  for (const o of real) {
    const k = `${o.eventId}:${day(o.at)}`;
    const g = groups.get(k) ?? { net: 0, n: 0, qty: 0, at: o.at.toISOString() };
    g.net += o.net; g.n += 1; g.qty += o.qty;
    if (o.at.toISOString() > g.at) g.at = o.at.toISOString();
    groups.set(k, g);
  }
  return { groups, testSales: orders.length - real.length };
}

describe.skipIf(!TEST_DB)("financeiro agregado no banco (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    P = await import("@/lib/data/painel");
    B = await import("@/lib/bank");
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (evs.length) {
      await db.delete(schema.orderRefunds).where(inArray(schema.orderRefunds.eventId, evs));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, evs));
      await db.delete(schema.events).where(inArray(schema.events.id, evs));
    }
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  it("extrato do Banco e totais por evento: iguais ao cálculo pedido a pedido", async () => {
    const { db, schema } = D;
    const owner = qaId("dono");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA", ownerUserId: owner, onboarding: { city: "x" } as never }).returning();
    orgs.push(org.id);
    const mkEv = async (absorbFee: boolean, daysAgo: number) => {
      const [e] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA financeiro", status: "published", startAt: new Date(Date.now() - daysAgo * 864e5), organizerId: org.id, createdByUserId: owner, absorbFee }).returning();
      evs.push(e.id);
      const [tt] = await db.insert(schema.ticketTypes).values({ eventId: e.id, name: "Pista", priceCents: 4321, quantity: 999 }).returning();
      return { e, tt };
    };
    const a = await mkEv(true, 20), b = await mkEv(false, -10);
    // valores escolhidos para a taxa de 7,99% cair perto de meio centavo (onde arredondar a soma daria diferente)
    const revs = [4321, 4321, 8642, 6258, 6258, 12_345, 99, 2503];
    const ids: string[] = [];
    let k = 0;
    for (const ev of [a, b]) {
      for (const r of revs) {
        const i = k++;
        const at = new Date(Date.now() - (i % 4) * 864e5 - (i % 3) * 3600_000);
        const [o] = await db.insert(schema.orders).values({
          userId: qaId("c"), eventId: ev.e.id, status: i % 7 === 3 ? "refunded" : "paid", subtotalCents: r + 500, meiaCents: i % 5 === 0 ? 500 : 0,
          discountCents: i % 5 === 0 ? 0 : 500, feeCents: 300, totalCents: r + 300, paymentMethod: "pix", paymentRef: i % 6 === 1 ? `TEST-${i}` : `STRIPE-pi_${i}`,
          paidAt: at, createdAt: at, resaleListingId: i === 9 ? ev.tt.id : null,
        }).returning();
        await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: ev.tt.id, quantity: 1 + (i % 3), unitPriceCents: r, unitFeeCents: 0 });
        ids.push(o.id);
      }
    }
    // dois reembolsos com trilha (um parcial em pedido ainda pago, um total)
    const { eq } = await import("drizzle-orm");
    const refundedIds = [ids[3], ids[2]];
    for (const [j, id] of refundedIds.entries()) {
      const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
      await db.insert(schema.orderRefunds).values({ orderId: id, eventId: o!.eventId, idemKey: qaId("r"), kind: "order", amountCents: 1000, producerCents: 900 - j * 100, status: "succeeded", test: false, actorName: "QA" });
    }
    const absorb = new Map([[a.e.id, true], [b.e.id, false]]);
    const before = await walletBefore([a.e.id, b.e.id], absorb, new Set(refundedIds));

    // o mesmo cálculo a partir das somas do banco
    const sums = await P.orderSums([a.e.id, b.e.id]);
    const rows = sums.filter((s) => s.status === "paid" || s.trail);
    const net = (s: (typeof sums)[number]) => s.revenue - P.platformFee(s.revenue, absorb.get(s.eventId) ?? false);
    const groups = new Map<string, { net: number; n: number; qty: number; at: string }>();
    for (const s of rows.filter((x) => !x.test && net(x) > 0)) {
      const key = `${s.eventId}:${s.day}`;
      const g = groups.get(key) ?? { net: 0, n: 0, qty: 0, at: s.at.toISOString() };
      g.net += net(s) * s.n; g.n += s.n; g.qty += s.qty;
      if (s.at.toISOString() > g.at) g.at = s.at.toISOString();
      groups.set(key, g);
    }
    expect(Object.fromEntries(groups)).toEqual(Object.fromEntries(before.groups));
    expect(rows.filter((x) => x.test || net(x) <= 0).reduce((t, x) => t + x.n, 0)).toBe(before.testSales);

    // totais por evento do financeiro (pedidos pagos, com as vendas de teste, como a tela mostrava)
    const list = await P.listOrders([a.e.id, b.e.id], absorb);
    for (const ev of [a, b]) {
      const old = list.filter((o) => o.status === "paid" && o.eventId === ev.e.id);
      const mine = sums.filter((s) => s.status === "paid" && s.eventId === ev.e.id);
      expect(P.totalsOf(mine, absorb.get(ev.e.id) ?? false)).toEqual({
        gross: old.reduce((t, o) => t + o.revenue, 0), net: old.reduce((t, o) => t + o.net, 0), qty: old.reduce((t, o) => t + o.qty, 0), orders: old.length,
      });
    }

    // e o extrato do Banco de verdade (walletFor) bate com o de antes
    const w = await B.walletFor(owner);
    const sales = (w?.entries ?? []).filter((x) => x.kind === "venda");
    expect(sales.reduce((t, x) => t + x.amount, 0)).toBe([...before.groups.values()].reduce((t, g) => t + g.net, 0));
    expect(sales.length).toBe(before.groups.size);
    expect(w?.testSales).toBe(before.testSales);
  });
});
