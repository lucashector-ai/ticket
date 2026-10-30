import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));
// código do ingresso controlável: com `dup` preenchido, o próximo código repete um que já existe
// (a gravação dos ingressos falha no meio da emissão, como se o Worker caísse ali)
const codes: { dup: string | null } = { dup: null };
vi.mock("@/lib/tickets/code", async (orig) => {
  const real = await orig<typeof import("@/lib/tickets/code")>();
  return { ...real, ticketCode: () => { const d = codes.dup; codes.dup = null; return d ?? real.ticketCode(); } };
});

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill");
const created: string[] = [];

async function makeEvent(quantity: number, maxPerOrder = 6) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA emissão atômica", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity, maxPerOrder }).returning();
  return { ev, tt };
}

async function makeOrder(eventId: string, ticketTypeId: string, qty: number, opts: { userId?: string; cpf?: string } = {}) {
  const { db, schema } = D;
  const [o] = await db.insert(schema.orders).values({
    userId: opts.userId ?? qaId("user"), eventId, status: "pending", subtotalCents: 5000 * qty, feeCents: 0, totalCents: 5000 * qty,
    paymentMethod: "pix", expiresAt: new Date(Date.now() + 15 * 60_000), buyerCpf: opts.cpf ?? null,
    holders: Array.from({ length: qty }, () => ({ ticketTypeId, name: "Pessoa Teste", meia: false, me: true, email: null })),
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId, quantity: qty, unitPriceCents: 5000, unitFeeCents: 0 });
  return o;
}

async function counts(eventId: string, ticketTypeId: string) {
  const { db, schema } = D;
  const { eq } = await import("drizzle-orm");
  const tt = await db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, ticketTypeId) });
  const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.eventId, eventId) });
  return { sold: tt!.sold, tickets: tks.length };
}

describe.skipIf(!TEST_DB)("emissão atômica e limite por CPF (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("queda no meio da emissão: nada fica pela metade e a nova tentativa não baixa o estoque de novo", async () => {
    const { ev, tt } = await makeEvent(10);
    // um ingresso qualquer já emitido, para a segunda emissão repetir o código dele
    const first = await makeOrder(ev.id, tt.id, 1);
    const r1 = await F.fulfillOrder(first.id, { ref: "TEST-a", charged: false });
    expect(r1.ok).toBe(true);
    const o = await makeOrder(ev.id, tt.id, 2);
    codes.dup = r1.ok ? r1.firstCode : null;
    await expect(F.fulfillOrder(o.id, { ref: "TEST-b", charged: false })).rejects.toThrow();
    // a falha não deixou estoque baixado sem ingresso
    expect(await counts(ev.id, tt.id)).toEqual({ sold: 1, tickets: 1 });
    // a nova tentativa (webhook de novo, depois do tempo da trava) emite certo
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.orders).set({ paidAt: new Date(Date.now() - 3 * 60_000) }).where(eq(D.schema.orders.id, o.id));
    const r2 = await F.fulfillOrder(o.id, { ref: "TEST-b", charged: false });
    expect(r2.ok).toBe(true);
    expect(await counts(ev.id, tt.id)).toEqual({ sold: 3, tickets: 3 });
  });

  it("mesmo CPF em duas contas confirmando ao mesmo tempo: o limite por pessoa vale", async () => {
    // 3 rodadas: sem a trava, as duas confirmações passam juntas pela conferência
    for (let round = 0; round < 3; round++) {
      const { ev, tt } = await makeEvent(20, 2);
      const cpf = "52998224725";
      const [a, b] = await Promise.all([makeOrder(ev.id, tt.id, 2, { cpf }), makeOrder(ev.id, tt.id, 2, { cpf })]);
      const rs = await Promise.all([a, b].map((o) => F.fulfillOrder(o.id, { ref: `TEST-cpf-${o.number}`, charged: false })));
      expect(rs.filter((r) => r.ok).length).toBe(1);
      const bad = rs.find((r) => !r.ok);
      if (bad && !bad.ok) expect(bad.error).toMatch(/CPF/);
      expect(await counts(ev.id, tt.id)).toEqual({ sold: 2, tickets: 2 });
    }
  });

  it("30 confirmações ao mesmo tempo com dois tipos em ordens diferentes: sem impasse de trava e sem vender acima", async () => {
    const { db, schema } = D;
    const { ev, tt: a } = await makeEvent(7, 6);
    const [b] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Camarote", priceCents: 9000, quantity: 5, maxPerOrder: 6 }).returning();
    const os = await Promise.all(Array.from({ length: 30 }, async (_, i) => {
      const [o] = await db.insert(schema.orders).values({
        userId: qaId("user"), eventId: ev.id, status: "pending", totalCents: 14_000, paymentMethod: "pix", expiresAt: new Date(Date.now() + 15 * 60_000),
        holders: [{ ticketTypeId: a.id, name: "Pessoa Teste", meia: false, me: true, email: null }, { ticketTypeId: b.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
      }).returning();
      // metade dos pedidos lista os tipos na ordem inversa
      const items = [{ orderId: o.id, ticketTypeId: a.id, quantity: 1, unitPriceCents: 5000 }, { orderId: o.id, ticketTypeId: b.id, quantity: 1, unitPriceCents: 9000 }];
      await db.insert(schema.orderItems).values(i % 2 ? items.reverse() : items);
      return o;
    }));
    const rs = await Promise.all(os.map((o) => F.fulfillOrder(o.id, { ref: `TEST-s-${o.number}`, charged: false })));
    const { eq } = await import("drizzle-orm");
    const [ta, tb] = await Promise.all([a.id, b.id].map((id) => db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, id) })));
    const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.eventId, ev.id) });
    expect(rs.filter((r) => r.ok).length).toBe(5);
    expect(ta!.sold).toBe(5);
    expect(tb!.sold).toBe(5);
    expect(tks.length).toBe(10);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && /esgotaram/.test(r.error))).toBe(true);
  }, 120_000);

  it("mesma conta com dois pedidos confirmando ao mesmo tempo: o limite vale", async () => {
    const { ev, tt } = await makeEvent(20, 2);
    const userId = qaId("user");
    const [a, b] = await Promise.all([makeOrder(ev.id, tt.id, 2, { userId }), makeOrder(ev.id, tt.id, 1, { userId })]);
    const rs = await Promise.all([a, b].map((o) => F.fulfillOrder(o.id, { ref: `TEST-u-${o.number}`, charged: false })));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    const c = await counts(ev.id, tt.id);
    expect(c.sold).toBe(c.tickets);
    expect(c.sold).toBeLessThanOrEqual(2);
  });
});
