import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Início do painel, Público e Marketing somados no banco (rodada 3, como o financeiro): os números têm de ser
 * iguais, centavo a centavo, aos de antes (trazer todos os pedidos e somar no servidor). As funções "antes" abaixo
 * são o código antigo das páginas, copiado como referência.
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

type P = typeof import("@/lib/data/painel");
let D: typeof import("@/db"), PN: P, H: typeof import("@/lib/painel/home"), BU: typeof import("@/lib/painel/build");
const created: string[] = [];
const DAY = 86_400_000;

/** Gerador determinístico (os mesmos dados a cada execução). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
}

async function seed(now: number) {
  const { db, schema } = D;
  const rnd = rng(42);
  const evs = [];
  for (const absorbFee of [true, false]) {
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: `QA somas ${absorbFee ? "absorve" : "repassa"}`, status: "published", startAt: new Date(now + (absorbFee ? 20 : -3) * DAY), absorbFee }).returning();
    created.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 4990, quantity: 500 }).returning();
    const [cp] = await db.insert(schema.coupons).values({ eventId: ev.id, code: qaId("CUP").slice(-12).toUpperCase(), percentOff: 15 }).returning();
    evs.push({ ev, tt, cp });
  }
  const buyers = Array.from({ length: 7 }, (_, i) => ({ id: qaId(`comprador${i}`), name: `Pessoa ${i}` }));
  const statuses = ["paid", "paid", "paid", "paid", "refunded", "pending"] as const;
  for (let i = 0; i < 90; i++) {
    const { ev, tt, cp } = evs[i % 2];
    const b = buyers[Math.floor(rnd() * buyers.length)];
    const qty = 1 + Math.floor(rnd() * 3);
    const meia = rnd() < 0.2 ? Math.round(4990 / 2) : 0;
    const coupon = rnd() < 0.25;
    const sub = 4990 * qty, discount = coupon ? Math.round((sub - meia) * 0.15) : 0;
    // datas espalhadas em 75 dias, inclusive perto das bordas de 7, 14, 30 e 60 dias
    const edge = [7, 14, 30, 60][i % 4] * DAY;
    const at = new Date(i % 9 === 0 ? now - edge + (rnd() < 0.5 ? -1 : 1) * 3_600_000 : now - Math.floor(rnd() * 75 * DAY));
    const status = statuses[Math.floor(rnd() * statuses.length)];
    const test = rnd() < 0.15;
    const [o] = await db.insert(schema.orders).values({
      userId: b.id, eventId: ev.id, status, subtotalCents: sub, meiaCents: meia, discountCents: discount, feeCents: 0, totalCents: sub - meia - discount,
      paymentMethod: test ? "test" : "pix", paymentRef: test ? "TEST-qa" : "STRIPE-pi_qa", couponId: coupon ? cp.id : null,
      buyerName: rnd() < 0.1 ? null : `${b.name}${i % 5 === 0 ? " Silva" : ""}`, buyerEmail: `${b.id}@example.com`,
      paidAt: status === "pending" ? null : at, createdAt: at,
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: qty, unitPriceCents: 4990 });
  }
  return evs.map((x) => x.ev);
}

describe.skipIf(!TEST_DB)("painel: somas no banco = somar pedido a pedido (banco de teste)", () => {
  const now = Date.now();
  let events: Awaited<ReturnType<typeof seed>>;
  let absorb: Map<string, boolean>;
  beforeAll(async () => {
    D = await import("@/db");
    PN = await import("@/lib/data/painel");
    H = await import("@/lib/painel/home");
    BU = await import("@/lib/painel/build");
    events = await seed(now);
    absorb = new Map(events.map((e) => [e.id, e.absorbFee]));
  }, 120_000);
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.coupons).where(inArray(schema.coupons.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("início do painel: indicadores dos 3 períodos, minilinhas, líquido por evento e últimos pedidos", async () => {
    const ids = events.map((e) => e.id);
    // antes: todos os pedidos pagos, somados aqui
    const paid = (await PN.listOrders(ids, absorb)).filter((o) => o.status === "paid");
    const { DAY: D1, daily, delta, spark } = BU;
    const PERIODS = [["7d", 7], ["30d", 30], ["all", 0]] as const;
    const first = paid.length ? Math.min(...paid.map((o) => o.at.getTime())) : now;
    const before = Object.fromEntries(PERIODS.map(([key, d]) => {
      const days = d || Math.max(10, Math.ceil((now - first) / D1) + 1);
      const inP = paid.filter((o) => o.at.getTime() >= now - days * D1);
      const prevP = d ? paid.filter((o) => o.at.getTime() < now - days * D1 && o.at.getTime() >= now - 2 * days * D1) : [];
      const sum = (l: typeof paid, f: (o: (typeof paid)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
      const rev = sum(inP, (o) => o.net), tix = sum(inP, (o) => o.qty), n = inP.length;
      const pRev = sum(prevP, (o) => o.net), pTix = sum(prevP, (o) => o.qty), pN = prevP.length;
      const avg = tix ? Math.round(rev / tix) : 0, pAvg = pTix ? Math.round(pRev / pTix) : 0;
      const bucket = (f: (o: (typeof paid)[number]) => number) => {
        const per = daily(inP, days, f, now).values, step = Math.ceil(days / 10);
        return Array.from({ length: 10 }, (_, i) => per.slice(i * step, (i + 1) * step).reduce((a, b) => a + b, 0));
      };
      return [key, { rev, tix, n, pRev, pTix, pN, avg, pAvg, sNet: bucket((o) => o.net), sQty: bucket((o) => o.qty), sN: bucket(() => 1), sAvg: bucket((o) => o.net / Math.max(1, o.qty)), d: delta(rev, pRev), sp: spark(bucket((o) => o.net)).line }];
    }));
    const netBefore = new Map<string, number>();
    for (const o of paid) netBefore.set(o.eventId, (netBefore.get(o.eventId) ?? 0) + o.net);

    // agora: somado no banco
    const rows = await PN.paidBuckets(ids, now, H.sparkStart(now, 7));
    const k = H.homeKpis(rows, absorb, now);
    for (const [key] of PERIODS) {
      const b = before[key];
      const [rev, tix, n, avg] = k[key];
      expect(rev.value).toBe((await import("@/lib/format")).brl(b.rev));
      expect(tix.value).toBe(b.tix.toLocaleString("pt-BR"));
      expect(n.value).toBe(b.n.toLocaleString("pt-BR"));
      expect(avg.value).toBe((await import("@/lib/format")).brl(b.avg));
      expect({ text: rev.text, cls: rev.cls }).toEqual(key === "all" ? { text: "", cls: "dl" } : b.d);
      expect(rev.line).toBe(b.sp);
      expect(tix.line).toBe(spark(b.sQty).line);
      expect(n.line).toBe(spark(b.sN).line);
      expect(avg.line).toBe(spark(b.sAvg).line);
    }
    // o teste tem vendas em todas as janelas (senão a comparação não prova nada)
    expect(before["7d"].n).toBeGreaterThan(0);
    expect(before["30d"].pN).toBeGreaterThan(0);
    expect(Object.fromEntries(H.netByEvent(rows, absorb))).toEqual(Object.fromEntries(netBefore));
    const latest = await PN.latestPaid(ids, absorb, 6);
    expect(latest.map((o) => [o.id, o.net, o.qty])).toEqual(paid.slice(0, 6).map((o) => [o.id, o.net, o.qty]));
  });

  it("público: compradores, pedidos, ingressos e gasto por pessoa", async () => {
    const ids = events.map((e) => e.id);
    const title = new Map(events.map((e) => [e.id, e.title]));
    const orders = (await PN.listOrders(ids, absorb)).filter((o) => o.status === "paid");
    const old = new Map<string, { name: string; email: string; orders: number; tickets: number; spent: number; events: string[]; last: number; lastEvent: string; meia: boolean }>();
    for (const o of orders) {
      const b = old.get(o.userId) ?? { name: o.buyer, email: o.email ?? "", orders: 0, tickets: 0, spent: 0, events: [], last: o.at.getTime(), lastEvent: "", meia: false };
      b.orders += 1; b.tickets += o.qty; b.spent += o.revenue; if (!b.events.includes(o.eventId)) b.events.push(o.eventId); if (o.meia) b.meia = true;
      if (o.at.getTime() >= b.last || !b.lastEvent) { b.last = o.at.getTime(); b.lastEvent = title.get(o.eventId) ?? ""; }
      old.set(o.userId, b);
    }
    const sums = await PN.buyerSums(ids);
    const now2 = new Map<string, { name: string; email: string; orders: number; tickets: number; spent: number; events: string[]; last: number; lastEvent: string; meia: boolean; newest: number }>();
    for (const x of sums) {
      const b = now2.get(x.userId) ?? { name: "", email: "", orders: 0, tickets: 0, spent: 0, events: [], last: x.last.getTime(), lastEvent: "", meia: false, newest: 0 };
      b.orders += x.n; b.tickets += x.qty; b.spent += x.spent; b.events.push(x.eventId); if (x.meia) b.meia = true;
      if (x.newest.getTime() > b.newest) { b.newest = x.newest.getTime(); b.name = x.name ?? "Comprador"; b.email = x.email ?? ""; }
      if (x.last.getTime() >= b.last || !b.lastEvent) { b.last = x.last.getTime(); b.lastEvent = title.get(x.eventId) ?? ""; }
      now2.set(x.userId, b);
    }
    expect(now2.size).toBe(old.size);
    for (const [u, b] of old) {
      const n = now2.get(u)!;
      expect({ ...n, events: n.events.sort(), newest: undefined }).toEqual({ ...b, events: b.events.sort(), newest: undefined });
    }
  });

  it("marketing: uso, desconto e receita de cada cupom", async () => {
    const ids = events.map((e) => e.id);
    const orders = await PN.listOrders(ids, absorb);
    const used = new Map<string, { n: number; off: number; rev: number }>();
    for (const o of orders) if (o.status === "paid" && o.couponId) {
      const x = used.get(o.couponId) ?? { n: 0, off: 0, rev: 0 };
      x.n += 1; x.off += o.discount; x.rev += o.revenue; used.set(o.couponId, x);
    }
    expect(used.size).toBeGreaterThan(0);
    expect(Object.fromEntries(await PN.couponSums(ids))).toEqual(Object.fromEntries(used));
  });
});
