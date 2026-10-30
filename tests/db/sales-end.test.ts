import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * U-73: nada se reserva, se emite ou se paga depois que o evento (ou a data do ingresso) terminou.
 * Reserva (placeOrder), emissão tardia (Pix pago depois do fim: estorno automático), compra em grupo e revenda.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// fora de uma requisição: sem cookies (sem fila, pré-venda nem parceiro) e sem cabeçalhos
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra"), F: typeof import("@/lib/payments/fulfill"), G: typeof import("@/lib/actions/grupo");
const created: string[] = [], users: string[] = [];
const H = 3_600_000;
const person = (): U => { const id = qaId("fim"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

/** Evento de data única que começa em `startIn` e termina em `endIn` (ms a partir de agora). */
async function event(startIn: number, endIn: number, extra: Record<string, unknown> = {}) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({
    slug: qaId("ev"), title: "QA fim das vendas", status: "published", startAt: new Date(Date.now() + startIn), endAt: new Date(Date.now() + endIn), queueMode: "off", ...extra,
  }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 20, maxPerOrder: 4 }).returning();
  return { ev, tt };
}

/** O evento termina agora (como se o tempo tivesse passado depois da reserva). */
async function endNow(eventId: string) {
  const { eq } = await import("drizzle-orm");
  await D.db.update(D.schema.events).set({ startAt: new Date(Date.now() - 6 * H), endAt: new Date(Date.now() - 60_000) }).where(eq(D.schema.events.id, eventId));
}

/** pedido de 1 ingresso para a própria pessoa */
const input = (slug: string, tt: string, u: U, extra: Record<string, unknown> = {}) => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: 1 }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: "529.982.247-25" },
  holders: [{ ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null }],
  method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null, ...extra,
});

async function pendingOrder(eventId: string, ticketTypeId: string, userId: string, extra: Record<string, unknown> = {}) {
  const { db, schema } = D;
  const [o] = await db.insert(schema.orders).values({
    userId, eventId, status: "pending", subtotalCents: 5000, feeCents: 0, totalCents: 5000, paymentMethod: "pix",
    buyerName: "Pessoa Teste", expiresAt: new Date(Date.now() + 15 * 60_000),
    holders: [{ ticketTypeId, name: "Pessoa Teste", meia: false, me: true, email: null }], ...extra,
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId, quantity: 1, unitPriceCents: 5000, unitFeeCents: 0 });
  return o;
}

async function orderState(orderId: string) {
  const { eq } = await import("drizzle-orm");
  const o = await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, orderId), with: { tickets: true } });
  return { status: o?.status, tickets: o?.tickets.length ?? 0 };
}

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("fim das vendas: evento encerrado (U-73, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
    F = await import("@/lib/payments/fulfill");
    G = await import("@/lib/actions/grupo");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.orderRefunds).where(inArray(schema.orderRefunds.eventId, created));
      await db.delete(schema.resaleListings).where(inArray(schema.resaleListings.eventId, created));
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.groupOrders).where(inArray(schema.groupOrders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("reserva: evento que já terminou (como a Calourada pelo link direto) é recusado e nenhum pedido é gravado", async () => {
    const { ev, tt } = await event(-8 * H, -60_000);
    const u = person(); session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, u));
    session.user = null;
    expect(r).toMatchObject({ ok: false, error: "As vendas deste evento já encerraram." });
    const { eq } = await import("drizzle-orm");
    expect(await D.db.query.orders.findMany({ where: eq(D.schema.orders.eventId, ev.id) })).toHaveLength(0);
  });

  it("reserva: evento em andamento (começou, ainda não terminou) continua vendendo", async () => {
    const { ev, tt } = await event(-H, 4 * H);
    const u = person(); session.user = u;
    const r = await C.placeOrder(input(ev.slug, tt.id, u));
    session.user = null;
    expect(r.ok).toBe(true);
  });

  it("várias datas: a data que já terminou não vende; a próxima data vende", async () => {
    const { db, schema } = D;
    // 1ª data ontem 20h–02h, 2ª data amanhã 20h–02h (o término gravado é o da última data)
    const day1 = Date.now() - 30 * H, day2 = Date.now() + 18 * H;
    const { ev } = await event(day1 - Date.now(), day2 + 6 * H - Date.now(), { format: "temporada" });
    const [s1, s2] = await db.insert(schema.eventSessions).values([
      { eventId: ev.id, startAt: new Date(day1), sortOrder: 0 }, { eventId: ev.id, startAt: new Date(day2), sortOrder: 1 },
    ]).returning();
    const [t1, t2] = await db.insert(schema.ticketTypes).values([
      { eventId: ev.id, name: "Dia 1", priceCents: 5000, quantity: 10, sessionId: s1.id }, { eventId: ev.id, name: "Dia 2", priceCents: 5000, quantity: 10, sessionId: s2.id },
    ]).returning();
    const u = person(); session.user = u;
    const r1 = await C.placeOrder(input(ev.slug, t1.id, u));
    expect(r1).toMatchObject({ ok: false, error: "As vendas desta data já encerraram. Escolha outra data." });
    const r2 = await C.placeOrder(input(ev.slug, t2.id, u));
    session.user = null;
    expect(r2.ok).toBe(true);
  });

  it("emissão tardia: Pix pago depois do fim não emite ingresso e é estornado automaticamente", async () => {
    const { ev, tt } = await event(H, 6 * H);
    const o = await pendingOrder(ev.id, tt.id, qaId("pix"));
    await endNow(ev.id);
    const r = await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: true });
    expect(r).toMatchObject({ ok: false, refunded: true });
    if (!r.ok) expect(r.error).toMatch(/vendas deste evento já encerraram/);
    expect(await orderState(o.id)).toEqual({ status: "refunded", tickets: 0 });
    const { eq } = await import("drizzle-orm");
    const t = await D.db.query.ticketTypes.findFirst({ where: eq(D.schema.ticketTypes.id, tt.id) });
    expect(t?.sold).toBe(0);
  });

  it("confirmação sem cobrança (modo de teste) depois do fim: não emite e o pedido é cancelado", async () => {
    const { ev, tt } = await event(H, 6 * H);
    const u = person();
    const o = await pendingOrder(ev.id, tt.id, u.id);
    await endNow(ev.id);
    session.user = u;
    const r = await C.confirmPayment(o.id);
    session.user = null;
    expect(r.ok).toBe(false);
    expect(await orderState(o.id)).toEqual({ status: "cancelled", tickets: 0 });
  });

  it("compra em grupo: não monta grupo de evento encerrado; parte de grupo aberto antes do fim não reserva nem emite depois", async () => {
    const { db, schema } = D;
    const ended = await event(-8 * H, -60_000);
    const leader = person(); session.user = leader;
    const g0 = await G.createGroup({ eventSlug: ended.ev.slug, items: [{ ticketTypeId: ended.tt.id, quantity: 2 }] });
    expect(g0).toMatchObject({ ok: false, error: "As vendas deste evento já encerraram." });

    const { ev, tt } = await event(H, 6 * H);
    const g = await G.createGroup({ eventSlug: ev.slug, items: [{ ticketTypeId: tt.id, quantity: 2 }] });
    expect(g.ok).toBe(true);
    const { eq } = await import("drizzle-orm");
    const grp = await db.query.groupOrders.findFirst({ where: eq(schema.groupOrders.eventId, ev.id), with: { shares: true } });
    const [a, b] = grp!.shares;
    // uma parte já com pedido aberto (Pix gerado antes do fim)
    const friend = person();
    const o = await pendingOrder(ev.id, tt.id, friend.id, { groupShareId: a.id });
    await db.update(schema.groupShares).set({ userId: friend.id, name: "Pessoa Teste", claimedAt: new Date() }).where(eq(schema.groupShares.id, a.id));
    await endNow(ev.id);
    // a outra parte tenta reservar depois do fim
    const other = person(); session.user = other;
    const r = await C.placeOrder(input(ev.slug, tt.id, other, { groupShareId: b.id }));
    session.user = null;
    expect(r).toMatchObject({ ok: false, error: "As vendas deste evento já encerraram." });
    // o Pix da primeira parte cai depois do fim: estorna, a parte não fica paga
    const f = await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: true });
    expect(f).toMatchObject({ ok: false, refunded: true });
    expect(await orderState(o.id)).toEqual({ status: "refunded", tickets: 0 });
    const share = await db.query.groupShares.findFirst({ where: eq(schema.groupShares.id, a.id) });
    expect(share?.paidAt).toBeNull();
  });

  it("revenda: anúncio de evento encerrado não reserva; pagamento que chega depois do fim estorna e o ingresso fica com quem vendeu", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { ev, tt } = await event(2 * H, 8 * H, { resaleEnabled: true });
    // o ingresso de quem vende (emitido pela rotina de verdade)
    const seller = qaId("vende");
    const so = await pendingOrder(ev.id, tt.id, seller);
    expect((await F.fulfillOrder(so.id, { ref: `TEST-${so.number}`, charged: false })).ok).toBe(true);
    const tk = await db.query.tickets.findFirst({ where: eq(schema.tickets.orderId, so.id) });
    const [l] = await db.insert(schema.resaleListings).values({ ticketId: tk!.id, eventId: ev.id, ticketTypeId: tt.id, sellerUserId: seller, priceCents: 4000 }).returning();
    const buyer = person();
    const bo = await pendingOrder(ev.id, tt.id, buyer.id, { resaleListingId: l.id, subtotalCents: 4000, totalCents: 4000 });
    await endNow(ev.id);
    const other = person(); session.user = other;
    const r = await C.placeOrder(input(ev.slug, tt.id, other, { resaleListingId: l.id }));
    session.user = null;
    expect(r).toMatchObject({ ok: false, error: "As vendas deste evento já encerraram." });
    const f = await F.fulfillOrder(bo.id, { ref: `TEST-${bo.number}`, charged: true });
    expect(f).toMatchObject({ ok: false, refunded: true });
    expect(await orderState(bo.id)).toEqual({ status: "refunded", tickets: 0 });
    const after = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, tk!.id) });
    expect(after?.holderUserId).toBe(seller);
    expect(after?.code).toBe(tk!.code);
    expect((await db.query.resaleListings.findFirst({ where: eq(schema.resaleListings.id, l.id) }))?.status).not.toBe("sold");
  });
});
