import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Prioridade 4 do dono: QR reutilizado e casos da portaria (seção 10). Ingressos emitidos pela emissão de verdade
 * (modo de teste) e lidos por checkinTicket, a mesma função da portaria pelo painel, pelo app e pela API.
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill"), C: typeof import("@/lib/checkin"), Q: typeof import("@/lib/tickets/qr");
const created: string[] = [];

async function issued(qty = 1) {
  const { db, schema } = D;
  const { eq } = await import("drizzle-orm");
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA portaria", status: "published", startAt: new Date(Date.now() + 2 * 3600_000) }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 10, maxPerOrder: 6 }).returning();
  const [o] = await db.insert(schema.orders).values({
    userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 5000 * qty, totalCents: 5000 * qty, paymentMethod: "pix",
    expiresAt: new Date(Date.now() + 15 * 60_000), holders: Array.from({ length: qty }, () => ({ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null })),
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: qty, unitPriceCents: 5000 });
  expect((await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })).ok).toBe(true);
  const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.orderId, o.id) });
  return { ev, o, tks, qr: await Promise.all(tks.map((t) => Q.qrPayload(t.code, t.secret))) };
}
const statusOf = async (id: string) => {
  const { eq } = await import("drizzle-orm");
  return (await D.db.query.tickets.findFirst({ where: eq(D.schema.tickets.id, id), columns: { status: true } }))?.status;
};

describe.skipIf(!TEST_DB)("portaria: QR de uso único e recusas (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    C = await import("@/lib/checkin");
    Q = await import("@/lib/tickets/qr");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("10 operadores lendo o mesmo QR ao mesmo tempo: entra uma vez; o código digitado depois também é recusado", async () => {
    const { ev, tks, qr } = await issued();
    const rs = await Promise.all(Array.from({ length: 10 }, () => C.checkinTicket(qr[0], new Set([ev.id]))));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect(rs.filter((r) => !r.ok).every((r) => r.status === 409)).toBe(true);
    const typed = await C.checkinTicket(tks[0].code, new Set([ev.id]));
    expect(typed.ok).toBe(false);
    expect(typed.error).toMatch(/já utilizado/);
  });

  it("QR com a assinatura de outro ingresso, código inexistente e lixo: recusados sem marcar nada", async () => {
    const { ev, tks, qr } = await issued(2);
    const swapped = `ONDE|${tks[0].code}|${qr[1].split("|")[2]}`;
    expect((await C.checkinTicket(swapped, new Set([ev.id]))).ok).toBe(false);
    expect((await C.checkinTicket("TW-ZZZZ-ZZZZ", new Set([ev.id]))).status).toBe(404);
    expect((await C.checkinTicket("<script>", new Set([ev.id]))).status).toBe(404);
    expect(await statusOf(tks[0].id)).toBe("valid");
  });

  it("operador de outro evento: 403 e o ingresso continua válido", async () => {
    const { tks, qr } = await issued();
    const other = await issued();
    const r = await C.checkinTicket(qr[0], new Set([other.ev.id]));
    expect(r.status).toBe(403);
    expect(await statusOf(tks[0].id)).toBe("valid");
  });

  it("reembolsado e cancelado: recusados com o motivo", async () => {
    const { ev, tks, qr } = await issued(2);
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.tickets).set({ status: "refunded" }).where(eq(D.schema.tickets.id, tks[0].id));
    await D.db.update(D.schema.tickets).set({ status: "cancelled" }).where(eq(D.schema.tickets.id, tks[1].id));
    const [a, b] = await Promise.all([C.checkinTicket(qr[0], new Set([ev.id])), C.checkinTicket(qr[1], new Set([ev.id]))]);
    expect(a.error).toMatch(/reembolsado/);
    expect(b.error).toMatch(/cancelado/);
    expect(await statusOf(tks[0].id)).toBe("refunded");
  });

  it("evento cancelado com reembolso ainda na fila: ingresso válido não entra", async () => {
    const { ev, tks, qr } = await issued();
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.events).set({ status: "cancelled" }).where(eq(D.schema.events.id, ev.id));
    const r = await C.checkinTicket(qr[0], new Set([ev.id]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Evento cancelado/);
    expect(await statusOf(tks[0].id)).toBe("valid");
  });

  it("pedido que deixou de estar pago (estorno externo pela metade do caminho): o ingresso não entra", async () => {
    const { ev, o, tks, qr } = await issued();
    const { eq } = await import("drizzle-orm");
    await D.db.update(D.schema.orders).set({ status: "refunded" }).where(eq(D.schema.orders.id, o.id));
    const r = await C.checkinTicket(qr[0], new Set([ev.id]));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Pagamento/);
    expect(await statusOf(tks[0].id)).toBe("valid");
  });
});
