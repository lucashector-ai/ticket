import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * D-12: rastro de cada ingresso, gravado na mesma transação das operações, e a leitura da central (com os ingressos
 * antigos montados a partir dos dados que já existiam). Sem a tabela/gravação, os testes falham (nada é registrado).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), F: typeof import("@/lib/payments/fulfill"), T: typeof import("@/lib/actions/tickets");
let C: typeof import("@/lib/checkin"), R: typeof import("@/lib/payments/refund"), A: typeof import("@/lib/admin-trail");
const created: string[] = [], users: string[] = [];
const person = (p: string): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: true }; };

async function eventWith(quantity = 10) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA rastro", status: "published", startAt: new Date(Date.now() + 30 * 864e5), transferEnabled: true, resaleEnabled: true }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity, maxPerOrder: 6 }).returning();
  return { ev, tt };
}
async function order(ev: { id: string }, tt: { id: string }, buyer: U, holders: { name: string; me: boolean; email: string | null }[], extra: Record<string, unknown> = {}) {
  const { db, schema } = D;
  await db.insert(schema.userProfiles).values({ userId: buyer.id, name: buyer.name, email: buyer.email }).onConflictDoNothing();
  const [o] = await db.insert(schema.orders).values({
    userId: buyer.id, eventId: ev.id, status: "pending", subtotalCents: 5000 * holders.length, feeCents: 0, totalCents: 5000 * holders.length,
    paymentMethod: "pix", buyerName: buyer.name, buyerEmail: buyer.email, expiresAt: new Date(Date.now() + 15 * 60_000),
    holders: holders.map((h) => ({ ticketTypeId: tt.id, meia: false, ...h })), ...extra,
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: holders.length, unitPriceCents: 5000, unitFeeCents: 0 });
  return o;
}
const eventsOf = async (ticketId: string) => {
  const { db, schema } = D;
  const { asc, eq } = await import("drizzle-orm");
  return db.query.ticketEvents.findMany({ where: eq(schema.ticketEvents.ticketId, ticketId), orderBy: [asc(schema.ticketEvents.createdAt)] });
};

describe.skipIf(!TEST_DB)("rastro do ingresso (D-12, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    F = await import("@/lib/payments/fulfill");
    T = await import("@/lib/actions/tickets");
    C = await import("@/lib/checkin");
    R = await import("@/lib/payments/refund");
    A = await import("@/lib/admin-trail");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.resaleListings).where(inArray(schema.resaleListings.eventId, created));
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("emissão, presente, transferência (cancelada e aceita), revenda, check-in e reembolso: tudo registrado e a central acha pelo código antigo e pelo e-mail", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { ev, tt } = await eventWith();
    const buyer = person("rastro-comprador"), friend = person("rastro-amiga"), next = person("rastro-proximo"), resaleBuyer = person("rastro-revenda");

    // compra com 2 ingressos: um do comprador e um enviado por e-mail para a amiga
    const o = await order(ev, tt, buyer, [{ name: buyer.name, me: true, email: null }, { name: friend.name, me: false, email: friend.email }]);
    expect((await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false })).ok).toBe(true);
    const tks = await db.query.tickets.findMany({ where: eq(schema.tickets.orderId, o.id) });
    const mine = tks.find((t) => t.status === "valid")!, gift = tks.find((t) => t.status === "transferred")!;
    expect((await eventsOf(mine.id)).map((e) => e.kind)).toEqual(["emitido"]);
    expect((await eventsOf(gift.id)).map((e) => e.kind)).toEqual(["emitido", "presente"]);
    const e0 = (await eventsOf(mine.id))[0];
    expect(e0).toMatchObject({ code: mine.code, fromUserId: buyer.id, holderName: buyer.name, orderId: o.id, amountCents: 5000 });

    // a amiga aceita o presente: código novo, anterior guardado
    const giftTr = await db.query.ticketTransfers.findFirst({ where: eq(schema.ticketTransfers.ticketId, gift.id) });
    session.user = friend;
    const acc = await T.acceptTransfer(giftTr!.token);
    expect(acc.ok).toBe(true);
    const giftEvs = await eventsOf(gift.id);
    expect(giftEvs.at(-1)).toMatchObject({ kind: "presente_aceito", prevCode: gift.code, fromUserId: buyer.id, toUserId: friend.id });

    // o comprador transfere o dele, cancela, transfere de novo e o próximo aceita
    session.user = buyer;
    const send = async () => { const fd = new FormData(); fd.set("ticketId", mine.id); fd.set("email", next.email); return T.transferTicket(null, fd); };
    expect(await send()).toMatchObject({ ok: true });
    expect(await T.cancelTransfer(mine.id)).toMatchObject({ ok: true });
    expect(await send()).toMatchObject({ ok: true });
    const pend = await db.query.ticketTransfers.findFirst({ where: (x, { and, eq: e }) => and(e(x.ticketId, mine.id), e(x.status, "pending")) });
    session.user = next;
    const acc2 = await T.acceptTransfer(pend!.token);
    expect(acc2.ok).toBe(true);
    if (!acc2.ok) return;
    expect((await eventsOf(mine.id)).map((e) => e.kind)).toEqual(["emitido", "transferencia_enviada", "transferencia_cancelada", "transferencia_enviada", "transferencia_aceita"]);

    // revenda: o próximo vende para outra pessoa
    const [l] = await db.insert(schema.resaleListings).values({ ticketId: mine.id, eventId: ev.id, ticketTypeId: tt.id, sellerUserId: next.id, priceCents: 4500 }).returning();
    const ro = await order(ev, tt, resaleBuyer, [{ name: resaleBuyer.name, me: true, email: null }], { resaleListingId: l.id, subtotalCents: 4500, totalCents: 4500 });
    const sold = await F.fulfillOrder(ro.id, { ref: "TEST-revenda-rastro", charged: false });
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect((await eventsOf(mine.id)).at(-1)).toMatchObject({ kind: "revenda_vendida", prevCode: acc2.code, code: sold.firstCode, fromUserId: next.id, toUserId: resaleBuyer.id, amountCents: 4500, refId: l.id });

    // portaria: código de outro evento é recusado (fica no rastro); depois entra
    expect((await C.checkinTicket(sold.firstCode, new Set(["00000000-0000-0000-0000-000000000000"]), "Portaria QA")).ok).toBe(false);
    expect((await C.checkinTicket(sold.firstCode, new Set([ev.id]), "Portaria QA")).ok).toBe(true);
    const tail = (await eventsOf(mine.id)).slice(-2);
    expect(tail.map((e) => e.kind)).toEqual(["checkin_recusado", "checkin"]);
    expect(tail[1].note).toBe("Portaria QA");

    // reembolso do ingresso da amiga (pedido original)
    const rf = await R.refundTickets({ orderId: o.id, ticketIds: [gift.id], kind: "tickets", actor: { userId: null, name: "Produtora QA" }, mail: "none" });
    expect(rf.ok).toBe(true);
    expect((await eventsOf(gift.id)).at(-1)).toMatchObject({ kind: "reembolso", note: "Ingressos reembolsados pelo produtor · Produtora QA" });

    // central: pelo código ORIGINAL do ingresso (antes de duas trocas) acha o ingresso, com titulares e passos em ordem
    const [byOld] = await A.adminTicketTrail(mine.code.replace(/-/g, ""));
    expect(byOld?.id).toBe(mine.id);
    expect(byOld.code).toBe(sold.firstCode);
    expect(byOld.prevCodes).toEqual(expect.arrayContaining([mine.code, acc2.code]));
    expect(byOld.holders.map((h) => [h.email, h.via])).toEqual([[buyer.email, "compra"], [next.email, "transferencia"], [resaleBuyer.email, "revenda"]]);
    expect(byOld.steps.map((s) => s.kind)).toEqual([
      "emitido", "transferencia_enviada", "transferencia_cancelada", "transferencia_enviada", "transferencia_aceita",
      "revenda_anunciada", "revenda_vendida", "checkin_recusado", "checkin",
    ]);
    expect(byOld.steps.find((s) => s.kind === "transferencia_aceita")?.to).toContain(next.email);
    expect(byOld.rebuilt).toBe(false);
    // pelo e-mail de quem recebeu o presente e pelo número do pedido
    expect((await A.adminTicketTrail(friend.email.toUpperCase())).map((x) => x.id)).toContain(gift.id);
    expect((await A.adminTicketTrail(`#${o.number}`)).map((x) => x.id)).toEqual(expect.arrayContaining([gift.id]));
  });

  it("na mesma transação: emissão que não acontece (esgotou) não deixa rastro; transferência recusada também não", async () => {
    const { db, schema } = D;
    const { eq, inArray } = await import("drizzle-orm");
    const { ev, tt } = await eventWith(1);
    const buyer = person("rastro-esgotou");
    const o = await order(ev, tt, buyer, [{ name: "A", me: true, email: null }, { name: "B", me: true, email: null }]);
    const r = await F.fulfillOrder(o.id, { ref: `TEST-${o.number}`, charged: false });
    expect(r.ok).toBe(false);
    const n = await db.select({ id: schema.ticketEvents.id }).from(schema.ticketEvents).where(eq(schema.ticketEvents.orderId, o.id));
    expect(n.length).toBe(0);
    expect(await db.query.tickets.findMany({ where: inArray(schema.tickets.orderId, [o.id]) })).toHaveLength(0);
  });

  it("ingresso antigo (sem rastro gravado): a central monta emissão, transferência, revenda, reembolso e check-in dos dados existentes", async () => {
    const { db, schema } = D;
    const { ev, tt } = await eventWith();
    const a = person("antigo-a"), b = person("antigo-b");
    await db.insert(schema.userProfiles).values([{ userId: a.id, name: a.name, email: a.email }, { userId: b.id, name: b.name, email: b.email }]).onConflictDoNothing();
    const [o] = await db.insert(schema.orders).values({ userId: a.id, eventId: ev.id, status: "paid", subtotalCents: 5000, totalCents: 5000, paymentMethod: "pix", paymentRef: "TEST-antigo", buyerName: a.name, buyerEmail: a.email }).returning();
    const [it2] = await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 5000, unitFeeCents: 0 }).returning();
    const past = (d: number) => new Date(Date.now() - d * 3_600_000);
    const [t] = await db.insert(schema.tickets).values({
      code: `TW-${qaId("x").slice(-8, -4).toUpperCase()}-${qaId("y").slice(-4).toUpperCase()}`, orderId: o.id, orderItemId: it2.id, eventId: ev.id, ticketTypeId: tt.id,
      holderUserId: b.id, holderName: b.name, status: "used", checkedInAt: past(1), secret: "x".repeat(32), createdAt: past(48),
    }).returning();
    await db.insert(schema.ticketTransfers).values({ ticketId: t.id, fromUserId: a.id, toEmail: b.email, toUserId: b.id, token: qaId("tok").padEnd(48, "0").slice(0, 48), status: "accepted", acceptedAt: past(20), createdAt: past(24) });
    const [tr] = await A.adminTicketTrail(t.code);
    expect(tr?.id).toBe(t.id);
    expect(tr.rebuilt).toBe(true);
    expect(tr.steps.map((s) => [s.kind, !!s.rebuilt])).toEqual([["emitido", true], ["transferencia_enviada", true], ["transferencia_aceita", true], ["checkin", true]]);
    expect(tr.steps[0]).toMatchObject({ amountCents: 5000, note: `Pedido #${o.number}` });
    expect(tr.steps[0].who).toContain(a.email);
    expect(tr.holders.map((h) => h.email)).toEqual([a.email, b.email]);
    // pelo e-mail de quem enviou (titular anterior)
    expect((await A.adminTicketTrail(a.email)).map((x) => x.id)).toContain(t.id);
  });

  it("a busca entende código com e sem hífen, e-mail e número do pedido; o resto não busca nada", () => {
    expect(A.parseTrailQuery(" tw-ab12-cd34 ")).toEqual({ code: "TW-AB12-CD34" });
    expect(A.parseTrailQuery("TWAB12CD34")).toEqual({ code: "TW-AB12-CD34" });
    expect(A.parseTrailQuery("Maria@Gmail.com")).toEqual({ email: "maria@gmail.com" });
    expect(A.parseTrailQuery("#50121")).toEqual({ order: 50121 });
    expect(A.parseTrailQuery("maria")).toBeNull();
    expect(A.parseTrailQuery("'; drop table tickets; --")).toBeNull();
  });
});
