import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

// fora do Next não existe "depois da resposta": os e-mails de confirmação não saem nos testes
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// a emissão não depende de sessão; o módulo de login do Neon só existe dentro do Next
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

type Db = typeof import("@/db");
type Fulfill = typeof import("@/lib/payments/fulfill");
type Holds = typeof import("@/lib/holds");
let D: Db, F: Fulfill, H: Holds;
const created: string[] = [];

async function makeEvent(opts: { quantity: number; maxPerOrder?: number; status?: "published" | "cancelled" }) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA estoque", status: opts.status ?? "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: opts.quantity, maxPerOrder: opts.maxPerOrder ?? 6 }).returning();
  return { ev, tt };
}

async function makeOrder(eventId: string, ticketTypeId: string, qty: number, opts: { userId?: string; expiresAt?: Date } = {}) {
  const { db, schema } = D;
  const [o] = await db.insert(schema.orders).values({
    userId: opts.userId ?? qaId("user"), eventId, status: "pending", subtotalCents: 5000 * qty, feeCents: 0, totalCents: 5000 * qty,
    paymentMethod: "pix", expiresAt: opts.expiresAt ?? new Date(Date.now() + 15 * 60_000),
    holders: Array.from({ length: qty }, () => ({ ticketTypeId, name: "Pessoa Teste", meia: false, me: true, email: null })),
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId, quantity: qty, unitPriceCents: 5000, unitFeeCents: 0 });
  return o;
}

const state = async (eventId: string, ticketTypeId: string) => {
  const { db, schema } = D;
  const { eq } = await import("drizzle-orm");
  const tt = await db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, ticketTypeId) });
  const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.eventId, eventId) });
  const ords = await db.query.orders.findMany({ where: eq(schema.orders.eventId, eventId) });
  return { sold: tt!.sold, tickets: tks.length, paid: ords.filter((o) => o.status === "paid").length, ords };
};

describe.skipIf(!TEST_DB)("estoque e emissão (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    H = await import("@/lib/holds");
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (!created.length) return;
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("restam 2 e 10 pessoas confirmam ao mesmo tempo: vendem 2, nunca mais", async () => {
    const { ev, tt } = await makeEvent({ quantity: 2 });
    const os = await Promise.all(Array.from({ length: 10 }, () => makeOrder(ev.id, tt.id, 1)));
    const rs = await Promise.all(os.map((o) => F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })));
    const s = await state(ev.id, tt.id);
    expect(rs.filter((r) => r.ok).length).toBe(2);
    expect(s.sold).toBe(2);
    expect(s.tickets).toBe(2);
    expect(s.paid).toBe(2);
    expect(s.ords.filter((o) => o.status === "cancelled").length).toBe(8);
  });

  it("dois pelo último ingresso: só um leva", async () => {
    const { ev, tt } = await makeEvent({ quantity: 1 });
    const [a, b] = await Promise.all([makeOrder(ev.id, tt.id, 1), makeOrder(ev.id, tt.id, 1)]);
    const rs = await Promise.all([a, b].map((o) => F.fulfillOrder(o.id, { ref: "TEST-x", charged: false })));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect((await state(ev.id, tt.id)).tickets).toBe(1);
  });

  it("a mesma confirmação repetida (webhook + navegador + clique duplo) emite uma vez só", async () => {
    const { ev, tt } = await makeEvent({ quantity: 50 });
    const o = await makeOrder(ev.id, tt.id, 3);
    const rs = await Promise.all(Array.from({ length: 6 }, () => F.fulfillOrder(o.id, { ref: "TEST-dup", charged: false })));
    const again = await F.fulfillOrder(o.id, { ref: "TEST-dup", charged: false });
    const s = await state(ev.id, tt.id);
    expect(s.tickets).toBe(3);
    expect(s.sold).toBe(3);
    expect(rs.every((r) => r.ok || ("busy" in r && r.busy))).toBe(true);
    expect(again.ok).toBe(true);
  });

  it("reserva vencida sem cobrança não emite e devolve nada ao estoque", async () => {
    const { ev, tt } = await makeEvent({ quantity: 5 });
    const o = await makeOrder(ev.id, tt.id, 1, { expiresAt: new Date(Date.now() - 60_000) });
    const r = await F.fulfillOrder(o.id, { ref: "TEST-exp", charged: false });
    const s = await state(ev.id, tt.id);
    expect(r.ok).toBe(false);
    expect(s.tickets).toBe(0);
    expect(s.sold).toBe(0);
    expect(s.ords[0].status).toBe("expired");
  });

  it("evento cancelado enquanto a pessoa pagava: não emite", async () => {
    const { ev, tt } = await makeEvent({ quantity: 5, status: "cancelled" });
    const o = await makeOrder(ev.id, tt.id, 1);
    const r = await F.fulfillOrder(o.id, { ref: "TEST-canc", charged: false });
    expect(r.ok).toBe(false);
    expect((await state(ev.id, tt.id)).tickets).toBe(0);
  });

  it("limite por pessoa conferido de novo na confirmação (dois pedidos da mesma conta)", async () => {
    const { ev, tt } = await makeEvent({ quantity: 50, maxPerOrder: 4 });
    const userId = qaId("user");
    const a = await makeOrder(ev.id, tt.id, 3, { userId });
    const ra = await F.fulfillOrder(a.id, { ref: "TEST-a", charged: false });
    const b = await makeOrder(ev.id, tt.id, 2, { userId });
    const rb = await F.fulfillOrder(b.id, { ref: "TEST-b", charged: false });
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(false);
    if (!rb.ok) expect(rb.error).toMatch(/limite é 4/);
    expect((await state(ev.id, tt.id)).sold).toBe(3);
  });

  it("pedido pendente dentro dos 15 min segura o lugar; vencido não; a própria pessoa não se bloqueia", async () => {
    const { ev, tt } = await makeEvent({ quantity: 3 });
    const userA = qaId("user");
    await makeOrder(ev.id, tt.id, 2, { userId: userA });
    await makeOrder(ev.id, tt.id, 1, { expiresAt: new Date(Date.now() - 60_000) });
    expect((await H.heldByType(ev.id)).get(tt.id)).toBe(2);
    expect((await H.heldByType(ev.id, { exceptUserId: userA })).get(tt.id) ?? 0).toBe(0);
    expect(await H.overbooked(ev.id, [tt.id])).toEqual([]);
  });

  it("dois pedidos pelo último lugar no mesmo instante: a reconferência acusa", async () => {
    const { ev, tt } = await makeEvent({ quantity: 1 });
    await Promise.all([makeOrder(ev.id, tt.id, 1), makeOrder(ev.id, tt.id, 1)]);
    expect(await H.overbooked(ev.id, [tt.id])).toEqual([tt.id]);
  });

  it("quem já pagou passa na frente de reserva não paga", async () => {
    const { ev, tt } = await makeEvent({ quantity: 1 });
    await makeOrder(ev.id, tt.id, 1); // reserva de outra pessoa, ainda não paga
    const paid = await makeOrder(ev.id, tt.id, 1, { expiresAt: new Date(Date.now() - 60_000) });
    // cobrança confirmada pelo processador depois de a reserva vencer: ainda há lugar, emite
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    await db.update(schema.orders).set({ paymentMethod: "free" }).where(eq(schema.orders.id, paid.id));
    const r = await F.fulfillOrder(paid.id, { ref: "TEST-pago", charged: true });
    expect(r.ok).toBe(true);
    expect((await state(ev.id, tt.id)).sold).toBe(1);
  });
});
