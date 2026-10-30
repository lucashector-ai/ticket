import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Portaria em evento de várias datas (achado do Marcos, rodada 3): o check-in só conferia evento e status, então o
 * ingresso de sábado entrava no domingo (e na sexta). Sem a correção, os testes de recusa falham (o ingresso entra
 * e fica "usado").
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

type Db = typeof import("@/db");
let D: Db, F: typeof import("@/lib/payments/fulfill"), C: typeof import("@/lib/checkin");
const created: string[] = [];
const H = 3600_000;

/**
 * Evento com três datas: ontem (sábado do teste), agora (domingo: portões daqui a 1 h, a portaria já está nele)
 * e daqui a 3 dias. Um tipo por data e um pedido pago com um ingresso de cada.
 */
async function festival() {
  const { db, schema } = D;
  const { eq } = await import("drizzle-orm");
  const now = Date.now();
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev-dias"), title: "QA festival (portaria por dia)", status: "published", startAt: new Date(now - 26 * H) }).returning();
  created.push(ev.id);
  const [ontem, hoje, depois] = await db.insert(schema.eventSessions).values([
    { eventId: ev.id, startAt: new Date(now - 26 * H), doorsAt: new Date(now - 27 * H), sortOrder: 0 },
    { eventId: ev.id, startAt: new Date(now + 2 * H), doorsAt: new Date(now + H), sortOrder: 1 },
    { eventId: ev.id, startAt: new Date(now + 72 * H), doorsAt: new Date(now + 71 * H), sortOrder: 2 },
  ]).returning();
  const types = await db.insert(schema.ticketTypes).values([ontem, hoje, depois].map((s, i) => ({ eventId: ev.id, sessionId: s.id, name: `Pista dia ${i + 1}`, priceCents: 5000, quantity: 10 }))).returning();
  const [o] = await db.insert(schema.orders).values({
    userId: qaId("buyer"), eventId: ev.id, status: "pending", subtotalCents: 15000, feeCents: 0, totalCents: 15000,
    paymentMethod: "pix", buyerName: "Quem Comprou", expiresAt: new Date(now + 15 * 60_000),
    holders: types.map((t) => ({ ticketTypeId: t.id, meia: false, name: "Titular", me: true, email: null })),
  }).returning();
  await db.insert(schema.orderItems).values(types.map((t) => ({ orderId: o.id, ticketTypeId: t.id, quantity: 1, unitPriceCents: 5000, unitFeeCents: 0 })));
  expect((await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })).ok).toBe(true);
  const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.orderId, o.id) });
  const by = (i: number) => tks.find((t) => t.ticketTypeId === types[i].id)!;
  return { ev, ontem: by(0), hoje: by(1), depois: by(2), sessions: [ontem, hoje, depois] };
}

describe.skipIf(!TEST_DB)("portaria: ingresso só entra no dia dele (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    C = await import("@/lib/checkin");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("ingresso de ontem e de daqui a 3 dias são recusados com o dia certo e continuam válidos; o de hoje entra", async () => {
    const { db, schema } = D;
    const { eq, inArray } = await import("drizzle-orm");
    const { qrPayload } = await import("@/lib/tickets/qr");
    const { ev, ontem, hoje, depois } = await festival();
    const ids = new Set([ev.id]);
    const { parts } = await import("@/lib/format");

    const r1 = await C.checkinTicket(await qrPayload(ontem.code, ontem.secret), ids);
    expect(r1.ok).toBe(false);
    const p1 = parts(new Date(Date.now() - 26 * 3600_000));
    expect(r1.error).toContain(`${p1.d}/${p1.m}`);
    expect(r1.error).toMatch(/vale só nesse dia/);
    expect(r1.ticket?.code).toBe(ontem.code);

    const r3 = await C.checkinTicket(depois.code, ids);
    expect(r3.ok).toBe(false);
    expect(r3.error).toMatch(/vale só nesse dia/);

    const r2 = await C.checkinTicket(await qrPayload(hoje.code, hoje.secret), ids);
    expect(r2.ok).toBe(true);

    const rows = await db.select({ code: schema.tickets.code, status: schema.tickets.status }).from(schema.tickets).where(inArray(schema.tickets.code, [ontem.code, depois.code]));
    expect(rows.map((r) => r.status)).toEqual(["valid", "valid"]);
    const [h] = await db.select({ status: schema.tickets.status }).from(schema.tickets).where(eq(schema.tickets.code, hoje.code));
    expect(h.status).toBe("used");
  });

  it("evento de data única (tipo sem sessão) segue como antes", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { ev, hoje } = await festival();
    // tira a sessão do tipo: vira ingresso sem data própria
    await db.update(schema.ticketTypes).set({ sessionId: null }).where(eq(schema.ticketTypes.id, hoje.ticketTypeId));
    expect((await C.checkinTicket(hoje.code, new Set([ev.id]))).ok).toBe(true);
  });
});
