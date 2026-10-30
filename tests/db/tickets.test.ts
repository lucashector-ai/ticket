import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// sessão controlada pelo teste (quem está "logado" ao aceitar a transferência)
const session: { user: { id: string; email: string; name: string; emailVerified: boolean } | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

type Db = typeof import("@/db");
let D: Db, F: typeof import("@/lib/payments/fulfill"), T: typeof import("@/lib/actions/tickets"), C: typeof import("@/lib/checkin");
const created: string[] = [];

async function eq() { return (await import("drizzle-orm")).eq; }

/** Evento + tipo + pedido pago (pelo fulfill de verdade) com `holders` informados. */
async function paidOrder(holders: { name: string; me: boolean; email: string | null }[], buyer = qaId("buyer")) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA ingressos", status: "published", startAt: new Date(Date.now() + 30 * 864e5), transferEnabled: true, resaleEnabled: true }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 10, maxPerOrder: 6 }).returning();
  const [o] = await db.insert(schema.orders).values({
    userId: buyer, eventId: ev.id, status: "pending", subtotalCents: 5000 * holders.length, feeCents: 0, totalCents: 5000 * holders.length,
    paymentMethod: "pix", buyerName: "Quem Comprou", expiresAt: new Date(Date.now() + 15 * 60_000),
    holders: holders.map((h) => ({ ticketTypeId: tt.id, meia: false, ...h })),
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: holders.length, unitPriceCents: 5000, unitFeeCents: 0 });
  const r = await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false });
  expect(r.ok).toBe(true);
  const tks = await db.query.tickets.findMany({ where: (await eq())(schema.tickets.orderId, o.id) });
  return { ev, tt, order: o, buyer, tks };
}

describe.skipIf(!TEST_DB)("ingresso: troca de dono e portaria (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    T = await import("@/lib/actions/tickets");
    C = await import("@/lib/checkin");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.resaleListings).where(inArray(schema.resaleListings.eventId, created));
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("ingresso enviado na compra: ao aceitar, código e QR mudam; o código antigo não entra mais", async () => {
    const email = `${qaId("presente")}@example.com`;
    const { ev, tks } = await paidOrder([{ name: "Quem Recebe", me: false, email }]);
    const gift = tks[0];
    expect(gift.status).toBe("transferred");
    // antes de aceitar, nem o código vale na portaria (o ingresso está a caminho de outra pessoa)
    expect((await C.checkinTicket(gift.code, new Set([ev.id]))).ok).toBe(false);
    const { db, schema } = D;
    const tr = await db.query.ticketTransfers.findFirst({ where: (await eq())(schema.ticketTransfers.ticketId, gift.id) });
    session.user = { id: qaId("recebe"), email, name: "Quem Recebe", emailVerified: true };
    const r = await T.acceptTransfer(tr!.token);
    session.user = null;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).not.toBe(gift.code);
    const old = await C.checkinTicket(gift.code, new Set([ev.id]));
    expect(old.ok).toBe(false);
    expect(old.error).toMatch(/não encontrado/);
    const now = await C.checkinTicket(r.code, new Set([ev.id]));
    expect(now.ok).toBe(true);
  });

  it("revenda: o comprador recebe código novo e o vendedor não entra com o antigo", async () => {
    const { ev, tt, buyer: seller, tks } = await paidOrder([{ name: "Quem Vende", me: true, email: null }]);
    const t = tks[0];
    const { db, schema } = D;
    const [l] = await db.insert(schema.resaleListings).values({ ticketId: t.id, eventId: ev.id, ticketTypeId: tt.id, sellerUserId: seller, priceCents: 4000 }).returning();
    const buyer = qaId("comprador");
    const [o] = await db.insert(schema.orders).values({
      userId: buyer, eventId: ev.id, status: "pending", subtotalCents: 4000, feeCents: 0, totalCents: 4000, paymentMethod: "pix",
      expiresAt: new Date(Date.now() + 15 * 60_000), resaleListingId: l.id,
      holders: [{ ticketTypeId: tt.id, name: "Quem Compra", meia: false, me: true, email: null }],
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 4000, unitFeeCents: 0 });
    const r = await F.fulfillOrder(o.id, { ref: "TEST-revenda", charged: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.firstCode).not.toBe(t.code);
    expect((await C.checkinTicket(t.code, new Set([ev.id]))).ok).toBe(false);
    const after = await db.query.tickets.findFirst({ where: (await eq())(schema.tickets.id, t.id) });
    expect(after?.holderUserId).toBe(buyer);
    expect(after?.code).toBe(r.firstCode);
  });

  it("portaria: QR adulterado, outro evento, e dois operadores no mesmo ingresso", async () => {
    const { ev, tks } = await paidOrder([{ name: "Titular", me: true, email: null }]);
    const t = tks[0];
    const { qrPayload } = await import("@/lib/tickets/qr");
    const good = await qrPayload(t.code, t.secret);
    expect((await C.checkinTicket(good.slice(0, -1) + (good.endsWith("A") ? "B" : "A"), new Set([ev.id]))).ok).toBe(false);
    const other = await C.checkinTicket(good, new Set(["00000000-0000-0000-0000-000000000000"]));
    expect(other.ok).toBe(false);
    expect(other.error).toMatch(/outro evento/);
    const both = await Promise.all([C.checkinTicket(good, new Set([ev.id])), C.checkinTicket(good, new Set([ev.id]))]);
    expect(both.filter((x) => x.ok).length).toBe(1);
    const again = await C.checkinTicket(good, new Set([ev.id]));
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/já utilizado/);
  });
});
