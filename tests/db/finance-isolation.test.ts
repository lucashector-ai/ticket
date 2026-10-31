import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Prioridade 3 do dono, no financeiro: um produtor não vê nem mexe no dinheiro de outro (SEC-100…), e venda de
 * teste (sem gateway) nunca vira saldo sacável. Produtoras e pedidos fictícios; reembolso de teste (sem Stripe).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db");
const orgs: string[] = [], evs: string[] = [];

describe.skipIf(!TEST_DB)("financeiro isolado entre produtoras (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (evs.length) {
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, evs));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, evs));
      await db.delete(schema.events).where(inArray(schema.events.id, evs));
    }
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  async function producer(name: string) {
    const { db, schema } = D;
    const owner: U = { id: qaId("prod-fin"), email: `${qaId("p")}@example.com`, name, emailVerified: true };
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org-fin"), name, ownerUserId: owner.id, onboarding: { kind: "festas" } as never }).returning();
    orgs.push(org.id);
    // evento já terminado há 30 dias (vendas liberadas para saque)
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev-fin"), title: `Evento ${name}`, status: "published", startAt: new Date(Date.now() - 30 * 864e5), endAt: new Date(Date.now() - 30 * 864e5 + 6 * 3600_000), organizerId: org.id, createdByUserId: owner.id }).returning();
    evs.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 10_000, quantity: 50, sold: 2 }).returning();
    const paid = async (ref: string) => {
      const [o] = await db.insert(schema.orders).values({
        userId: qaId("comprador"), eventId: ev.id, status: "paid", subtotalCents: 10_000, feeCents: 799, totalCents: 10_799, paymentMethod: "pix", paymentRef: ref,
        paidAt: new Date(Date.now() - 31 * 864e5), holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
      }).returning();
      const [it] = await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 10_000, unitFeeCents: 799 }).returning();
      await db.insert(schema.tickets).values({ code: `TW-${qaId("t").slice(-4).toUpperCase()}-${qaId("t").slice(-4).toUpperCase()}`, orderId: o.id, orderItemId: it.id, eventId: ev.id, ticketTypeId: tt.id, holderUserId: o.userId, holderName: "Pessoa Teste", secret: qaId("s").slice(-16), status: "valid" });
      return o;
    };
    const real = await paid(`STRIPE-pi_qa_${qaId("x").slice(-8)}`);
    const test = await paid(`TEST-${Date.now()}`);
    return { owner, org, ev, real, test };
  }

  it("saldo de cada produtora só com os próprios eventos; venda de teste fica fora do saldo", async () => {
    const B = await import("@/lib/bank");
    const a = await producer("Produtora A (fin)"), b = await producer("Produtora B (fin)");
    const wa = await B.walletFor(a.owner.id), wb = await B.walletFor(b.owner.id);
    expect(wa?.org?.id).toBe(a.org.id);
    expect(wb?.org?.id).toBe(b.org.id);
    // cada uma: 1 venda real de R$ 100 (taxa paga pelo comprador) disponível; a de teste não entra
    expect(wa?.available).toBe(10_000);
    expect(wb?.available).toBe(10_000);
    expect(wa?.testSales).toBe(1);
    // as linhas de venda do extrato levam o id do evento ("v:<evento>:<dia>")
    const sales = (w: typeof wa) => (w?.entries ?? []).filter((e) => e.kind === "venda").map((e) => e.id);
    expect(sales(wa).length).toBe(1);
    expect(sales(wa).every((id) => id.startsWith(`v:${a.ev.id}:`))).toBe(true);
    expect(sales(wb).every((id) => id.startsWith(`v:${b.ev.id}:`))).toBe(true);
  });

  it("reembolso pelo painel com evento ou pedido de outra produtora: recusado e nada muda", async () => {
    const R = await import("@/lib/actions/reembolsos");
    const a = await producer("Produtora C (fin)"), b = await producer("Produtora D (fin)");
    session.user = a.owner;
    const viaOtherEvent = await R.refundOrderAction({ eventId: b.ev.id, orderId: b.test.id, sel: "all", note: "", allowCheckedIn: true });
    const viaOwnEvent = await R.refundOrderAction({ eventId: a.ev.id, orderId: b.test.id, sel: "all", note: "", allowCheckedIn: true });
    const preview = await R.previewOrderRefund(a.ev.id, b.real.id, "all");
    session.user = null;
    expect(viaOtherEvent.ok).toBe(false);
    expect(viaOwnEvent.ok).toBe(false);
    expect(preview.ok).toBe(false);
    const { eq } = await import("drizzle-orm");
    const o = await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, b.test.id) });
    expect(o?.status).toBe("paid");
    expect(o?.refundedCents).toBe(0);
  });
});
