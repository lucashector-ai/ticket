import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Reembolso em transação (rodada 3, mesmo padrão da emissão S-24). Antes, os efeitos do reembolso eram comandos
 * separados: uma queda depois de cancelar os ingressos e antes de devolver os lugares deixava o lugar preso, a linha
 * do reembolso "pending" para sempre (a nova tentativa já não achava nada a reembolsar) e o pedido sem o valor
 * devolvido. A queda é simulada com um gatilho no banco de teste que falha ao devolver o lugar daquele tipo.
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill"), R: typeof import("@/lib/payments/refund");
const created: string[] = [];
const actor = { userId: null, name: "Teste" };

async function paidOrder(qty: number) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA reembolso atômico", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 10 }).returning();
  const [o] = await db.insert(schema.orders).values({
    userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 5000 * qty, feeCents: 400 * qty, totalCents: 5400 * qty, paymentMethod: "pix",
    expiresAt: new Date(Date.now() + 15 * 60_000), holders: Array.from({ length: qty }, () => ({ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null })),
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: qty, unitPriceCents: 5000, unitFeeCents: 400 });
  expect((await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })).ok).toBe(true);
  return { ev, tt, o };
}

/** "Queda" ao devolver o lugar deste tipo: o gatilho falha no meio dos efeitos do reembolso. */
async function withCrash<T>(ticketTypeId: string, fn: () => Promise<T>): Promise<T> {
  const { db } = D;
  const { sql } = await import("drizzle-orm");
  const name = `qa_test_crash_${ticketTypeId.replace(/-/g, "").slice(0, 12)}`;
  await db.execute(sql.raw(`create or replace function ${name}() returns trigger language plpgsql as $$ begin raise exception 'queda simulada'; end $$`));
  await db.execute(sql.raw(`create trigger ${name} before update on ticket_types for each row when (old.id = '${ticketTypeId}') execute function ${name}()`));
  try { return await fn(); } finally {
    await db.execute(sql.raw(`drop trigger if exists ${name} on ticket_types`));
    await db.execute(sql.raw(`drop function if exists ${name}()`));
  }
}

async function state(orderId: string, ticketTypeId: string) {
  const { db, schema } = D;
  const { eq } = await import("drizzle-orm");
  const [o, tt, tks, rows] = await Promise.all([
    db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) }),
    db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, ticketTypeId) }),
    db.query.tickets.findMany({ where: eq(schema.tickets.orderId, orderId) }),
    db.query.orderRefunds.findMany({ where: eq(schema.orderRefunds.orderId, orderId) }),
  ]);
  return {
    status: o!.status, refunded: o!.refundedCents, sold: tt!.sold, valid: tks.filter((t) => t.status === "valid").length,
    rows: rows.map((r) => r.status).sort(), succeeded: rows.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amountCents, 0),
  };
}

describe.skipIf(!TEST_DB)("reembolso atômico (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    R = await import("@/lib/payments/refund");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.orderRefunds).where(inArray(schema.orderRefunds.eventId, created));
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("queda no meio do reembolso: nada fica pela metade e a nova tentativa conclui", async () => {
    const { o, tt } = await paidOrder(2);
    expect((await state(o.id, tt.id)).sold).toBe(2);
    const r1 = await withCrash(tt.id, () => R.refundTickets({ orderId: o.id, ticketIds: "all", kind: "order", actor, mail: "none", allowCheckedIn: true }).catch((e) => ({ ok: false as const, error: String(e) })));
    expect(r1.ok).toBe(false);
    // nada aplicado: ingressos válidos, lugar não devolvido, pedido pago, nenhum valor marcado como devolvido
    expect(await state(o.id, tt.id)).toMatchObject({ status: "paid", refunded: 0, sold: 2, valid: 2, succeeded: 0 });
    // nova tentativa depois do tempo da trava (STALE_MS): retoma a mesma linha e conclui uma vez só
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.orderRefunds).set({ updatedAt: new Date(Date.now() - 3 * 60_000) }).where(eq(D.schema.orderRefunds.orderId, o.id));
    const r2 = await R.refundTickets({ orderId: o.id, ticketIds: "all", kind: "order", actor, mail: "none", allowCheckedIn: true });
    expect(r2.ok).toBe(true);
    expect(await state(o.id, tt.id)).toMatchObject({ status: "refunded", refunded: 10_800, sold: 0, valid: 0, rows: ["succeeded"], succeeded: 10_800 });
  });

  it("dois reembolsos diferentes do mesmo pedido ao mesmo tempo: nunca devolve mais que o pago", async () => {
    for (let round = 0; round < 3; round++) {
      const { o, tt } = await paidOrder(3);
      const tks = await D.db.query.tickets.findMany({ where: (await import("drizzle-orm")).eq(D.schema.tickets.orderId, o.id) });
      // produtor reembolsa o pedido inteiro enquanto o comprador cancela um ingresso
      const rs = await Promise.all([
        R.refundTickets({ orderId: o.id, ticketIds: "all", kind: "order", actor, mail: "none", allowCheckedIn: true }),
        R.refundTickets({ orderId: o.id, ticketIds: [tks[0].id], kind: "buyer", actor, mail: "none", allowCheckedIn: true }),
      ]);
      const s = await state(o.id, tt.id);
      expect(rs.some((r) => r.ok)).toBe(true);
      expect(s.succeeded).toBeLessThanOrEqual(o.totalCents);
      expect(s.refunded).toBe(s.succeeded);
      // lugares devolvidos = ingressos que deixaram de valer (nem a mais, nem a menos)
      expect(3 - s.sold).toBe(3 - s.valid);
    }
  });

  it("estorno automático de pedido: pedido, ingressos e lugares mudam juntos (queda no meio não deixa pela metade)", async () => {
    const { o, tt } = await paidOrder(2);
    await expect(withCrash(tt.id, () => R.markOrderRefunded(o.id))).rejects.toThrow();
    expect(await state(o.id, tt.id)).toMatchObject({ status: "paid", sold: 2, valid: 2 });
    expect(await R.markOrderRefunded(o.id)).toBe(true);
    expect(await state(o.id, tt.id)).toMatchObject({ status: "refunded", sold: 0, valid: 0 });
    // repetir não devolve o lugar de novo
    expect(await R.markOrderRefunded(o.id)).toBe(false);
    expect((await state(o.id, tt.id)).sold).toBe(0);
  });
});
