import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaCpf, qaId, TEST_DB } from "./setup";

/** um CPF por pessoa fictícia (o mesmo CPF não segura o mesmo evento em duas contas, SEC-305) */
const cpfs = new Map<string, string>();
const cpfOf = (id: string) => cpfs.get(id) ?? cpfs.set(id, qaCpf()).get(id)!;

/*
 * Cota de meia-entrada por setor e data (decisão do dono: 40% dos lugares do setor). Conta o tipo Meia e a caixa
 * "Meia-entrada" da Inteira, na reserva e na emissão. Sem a correção, os pedidos passavam da cota (só o estoque de
 * cada tipo valia).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
let current: U | null = null;
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => current }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [];
const person = (): U => { const id = qaId("meia"); users.push(id); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };
const SOLD_OUT = "A meia-entrada deste setor esgotou. A inteira continua disponível.";

async function event(types: { name: string; kind: string; qty: number; price?: number; sector?: string; session?: string | null }[]) {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA cota de meia", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const rows = !types.length ? [] : await db.insert(schema.ticketTypes).values(types.map((t) => ({
    eventId: ev.id, name: t.name, kind: t.kind, priceCents: t.price ?? 5000, quantity: t.qty, maxPerOrder: 6, sector: t.sector ?? "Pista", sessionId: t.session ?? null,
  }))).returning();
  return { ev, types: rows };
}
const buy = (slug: string, typeId: string, u: U, meia: boolean) => C.placeOrder({
  eventSlug: slug, items: [{ ticketTypeId: typeId, quantity: 1 }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: cpfOf(u.id) },
  holders: [{ ticketTypeId: typeId, name: "Pessoa Teste", meia, me: true, email: null }],
  method: "pix", installments: 1, groupShareId: null, resaleListingId: null,
});
/** Cada pedido com a sua conta (a sessão é lida no começo da ação, antes de qualquer espera). */
const as = (u: U, fn: () => ReturnType<typeof buy>) => { current = u; const p = fn(); current = null; return p; };

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("cota de meia-entrada por setor (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    current = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
  });

  it("caixa de meia na Inteira (setor sem tipo Meia): 10 lugares → 4 meias; a 5ª é recusada com a mensagem; a inteira segue", async () => {
    const { ev, types } = await event([{ name: "Inteira", kind: "inteira", qty: 10 }]);
    for (let i = 0; i < 4; i++) expect(await as(person(), () => buy(ev.slug, types[0].id, current!, true))).toMatchObject({ ok: true });
    expect(await as(person(), () => buy(ev.slug, types[0].id, current!, true))).toMatchObject({ ok: false, error: SOLD_OUT });
    expect(await as(person(), () => buy(ev.slug, types[0].id, current!, false))).toMatchObject({ ok: true });
  });

  it("8 pessoas ao mesmo tempo pelo tipo Meia (estoque 5, cota do setor 4): passam no máximo 4", async () => {
    // Inteira 5 + Meia 5 = 10 lugares → 4 meias (sem a cota, o estoque do tipo Meia deixava 5)
    const { ev, types } = await event([{ name: "Inteira", kind: "inteira", qty: 5 }, { name: "Meia-entrada", kind: "meia", qty: 5, price: 2500 }]);
    const meia = types.find((t) => t.kind === "meia")!;
    const rs = await Promise.all(Array.from({ length: 8 }, () => { const u = person(); current = u; const p = buy(ev.slug, meia.id, u, false); current = null; return p; }));
    expect(rs.filter((r) => r.ok)).toHaveLength(4);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && (r.error === SOLD_OUT || /reservar os últimos/.test(r.error)))).toBe(true);
  });

  it("cota é por setor e por data: Camarote e a outra data não dividem a cota da Pista no sábado", async () => {
    const { db, schema } = D;
    const { ev: e0 } = await event([]);
    const [s1, s2] = await db.insert(schema.eventSessions).values([{ eventId: e0.id, startAt: new Date(Date.now() + 30 * 864e5) }, { eventId: e0.id, startAt: new Date(Date.now() + 31 * 864e5) }]).returning();
    const rows = await db.insert(schema.ticketTypes).values([
      { eventId: e0.id, name: "Inteira", kind: "inteira", priceCents: 5000, quantity: 5, maxPerOrder: 6, sector: "Pista", sessionId: s1.id },
      { eventId: e0.id, name: "Inteira", kind: "inteira", priceCents: 5000, quantity: 5, maxPerOrder: 6, sector: "Camarote", sessionId: s1.id },
      { eventId: e0.id, name: "Inteira", kind: "inteira", priceCents: 5000, quantity: 5, maxPerOrder: 6, sector: "Pista", sessionId: s2.id },
    ]).returning();
    // 5 lugares → 2 meias em cada setor e data
    for (const t of rows) {
      for (let i = 0; i < 2; i++) expect(await as(person(), () => buy(e0.slug, t.id, current!, true))).toMatchObject({ ok: true });
      expect(await as(person(), () => buy(e0.slug, t.id, current!, true))).toMatchObject({ ok: false, error: SOLD_OUT });
    }
  });

  it("na emissão: pedido com meia cuja cota já foi vendida não emite (quem pagou antes tem prioridade)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const F = await import("@/lib/payments/fulfill");
    const { ev, types } = await event([{ name: "Inteira", kind: "inteira", qty: 5 }]);
    const t = types[0];
    // 2 meias já vendidas (cota de 5 lugares = 2)
    const paid = person();
    const [o1] = await db.insert(schema.orders).values({ userId: paid.id, eventId: ev.id, status: "paid", subtotalCents: 5000, totalCents: 5000, paymentMethod: "pix", paymentRef: "TEST-cota" }).returning();
    await db.insert(schema.tickets).values([0, 1].map((i) => ({ code: `TW-${qaId("c").slice(-4).toUpperCase()}-${String(i).padStart(4, "0")}`, orderId: o1.id, eventId: ev.id, ticketTypeId: t.id, holderUserId: paid.id, halfPrice: true, secret: "x".repeat(32) })));
    await db.update(schema.ticketTypes).set({ sold: 2 }).where(eq(schema.ticketTypes.id, t.id));
    // um pedido pendente com meia que entrou antes de a cota acabar (gravado direto, como uma reserva antiga)
    const late = person();
    const [o2] = await db.insert(schema.orders).values({
      userId: late.id, eventId: ev.id, status: "pending", subtotalCents: 5000, meiaCents: 2500, totalCents: 2500, paymentMethod: "pix",
      expiresAt: new Date(Date.now() + 10 * 60_000), holders: [{ ticketTypeId: t.id, name: "Atrasado", meia: true, me: true, email: null }],
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o2.id, ticketTypeId: t.id, quantity: 1, unitPriceCents: 5000, unitFeeCents: 0 });
    const r = await F.fulfillOrder(o2.id, { ref: `TEST-${o2.number}`, charged: false });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain(SOLD_OUT.replace(/\.$/, ""));
    expect(await db.query.tickets.findMany({ where: eq(schema.tickets.orderId, o2.id) })).toHaveLength(0);
  });
});
