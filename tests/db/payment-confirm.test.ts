import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Prioridade 1 do dono: ingresso só com pagamento confirmado pelo servidor (SEC-100…).
 * Stripe "ligada" com chaves falsas só deste teste e SEM rede: a assinatura do webhook é conferida localmente e o
 * estorno automático (que chamaria a Stripe) é substituído por um registro, para conferir que ele foi pedido.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
const refunds: string[] = [];
vi.mock("@/lib/payments/refund", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/refund")>()),
  // estorno sem rede: só registra o pedido (a emissão trata como estorno feito)
  refundOrder: async (orderId: string) => { refunds.push(orderId); return { ok: true, refundedCents: 0, full: true, stripeRefundId: null }; },
}));

const SECRET = "whsec_teste_local_financeiro";
let D: typeof import("@/db"), W: typeof import("@/app/api/webhooks/stripe/route"), C: typeof import("@/lib/actions/compra"), F: typeof import("@/lib/payments/fulfill");
const created: string[] = [];
const prevKey = process.env.STRIPE_SECRET_KEY, prevHook = process.env.STRIPE_WEBHOOK_SECRET;

function post(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return W.POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
}
type PiOpts = { amount?: number; currency?: string; livemode?: boolean };
const piEvent = (pi: string, orderId: string, o: PiOpts = {}) => ({
  id: `evt_${qaId("e").slice(-10)}`, object: "event", type: "payment_intent.succeeded", livemode: o.livemode ?? false,
  data: { object: { id: pi, object: "payment_intent", metadata: { orderId }, amount: o.amount ?? 5000, amount_received: o.amount ?? 5000, currency: o.currency ?? "brl", livemode: o.livemode ?? false } },
});
const newPi = () => `pi_qa_${qaId("p").slice(-8)}`;

describe.skipIf(!TEST_DB)("confirmação do pagamento: só o servidor emite (banco de teste, sem rede)", () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_falsa_so_para_o_teste";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    D = await import("@/db");
    W = await import("@/app/api/webhooks/stripe/route");
    C = await import("@/lib/actions/compra");
    F = await import("@/lib/payments/fulfill");
  });
  afterAll(async () => {
    session.user = null;
    process.env.STRIPE_SECRET_KEY = prevKey; process.env.STRIPE_WEBHOOK_SECRET = prevHook;
    if (!prevKey) delete process.env.STRIPE_SECRET_KEY;
    if (!prevHook) delete process.env.STRIPE_WEBHOOK_SECRET;
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  async function pendingOrder(opts: { total?: number; userId?: string; status?: "pending" | "expired" | "refunded"; pi?: string | null } = {}) {
    const { db, schema } = D;
    const price = opts.total ?? 5000;
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA confirmação", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
    created.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: price, quantity: 10 }).returning();
    const expired = opts.status === "expired";
    const [o] = await db.insert(schema.orders).values({
      userId: opts.userId ?? qaId("u"), eventId: ev.id, status: opts.status ?? "pending", subtotalCents: price, totalCents: price, paymentMethod: price ? "pix" : "free",
      stripePaymentIntentId: opts.pi ?? null,
      expiresAt: new Date(Date.now() + (expired ? -20 : 15) * 60_000), holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: price });
    return { ev, tt, o };
  }
  const load = async (id: string) => {
    const { eq } = await import("drizzle-orm");
    const o = await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, id) });
    const t = await D.db.query.tickets.findMany({ where: eq(D.schema.tickets.orderId, id) });
    return { o, t };
  };

  it("\"Já fiz o pagamento\" com a Stripe ligada não emite pedido com valor", async () => {
    const u: U = { id: qaId("u"), email: "x@example.com", name: "Pessoa Teste", emailVerified: true };
    const { o } = await pendingOrder({ userId: u.id });
    session.user = u;
    const r = await C.confirmPayment(o.id);
    session.user = null;
    expect(r.ok).toBe(false);
    const after = await load(o.id);
    expect(after.o?.status).toBe("pending");
    expect(after.t.length).toBe(0);
  });

  it("pedido de outra conta: confirmPayment não acha (nem emite)", async () => {
    const { o } = await pendingOrder({ total: 0 });
    session.user = { id: qaId("intruso"), email: "y@example.com", name: "Outra Pessoa", emailVerified: true };
    const r = await C.confirmPayment(o.id);
    session.user = null;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não encontrado/);
    expect((await load(o.id)).t.length).toBe(0);
  });

  it("pedido grátis (R$ 0) confirma sem pagamento, com referência FREE", async () => {
    const u: U = { id: qaId("u"), email: "z@example.com", name: "Pessoa Teste", emailVerified: true };
    const { o } = await pendingOrder({ total: 0, userId: u.id });
    session.user = u;
    const r = await C.confirmPayment(o.id);
    session.user = null;
    expect(r.ok).toBe(true);
    const after = await load(o.id);
    expect(after.o?.paymentRef).toMatch(/^FREE-/);
    expect(after.t.length).toBe(1);
  });

  it("webhook com valor menor que o pedido: não emite e pede o estorno", async () => {
    const { o } = await pendingOrder();
    const pi = newPi();
    const r = await post(piEvent(pi, o.id, { amount: 100 }));
    expect(r.status).toBe(200);
    const after = await load(o.id);
    expect(after.t.length).toBe(0);
    expect(after.o?.status).not.toBe("paid");
    expect(refunds).toContain(o.id);
  });

  it("webhook em outra moeda (mesmo número): não emite", async () => {
    const { o } = await pendingOrder();
    const r = await post(piEvent(newPi(), o.id, { currency: "usd" }));
    expect(r.status).toBe(200);
    expect((await load(o.id)).t.length).toBe(0);
    expect(refunds).toContain(o.id);
  });

  it("webhook de pagamento em modo de teste com a chave de produção (e vice-versa): ignorado", async () => {
    const { o } = await pendingOrder();
    const r = await post(piEvent(newPi(), o.id, { livemode: true }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ignored: true });
    const after = await load(o.id);
    expect(after.o?.status).toBe("pending");
    expect(after.t.length).toBe(0);
  });

  it("webhook de outro PaymentIntent apontando (metadata) para pedido já ligado a outro: não emite", async () => {
    const { o } = await pendingOrder({ pi: newPi() });
    const r = await post(piEvent(newPi(), o.id));
    expect(r.status).toBe(200);
    const after = await load(o.id);
    expect(after.o?.status).toBe("pending");
    expect(after.t.length).toBe(0);
  });

  it("confirmação que chega depois do reembolso total não emite", async () => {
    const pi = newPi();
    const { o } = await pendingOrder({ status: "refunded", pi });
    expect((await post(piEvent(pi, o.id))).status).toBe(200);
    const after = await load(o.id);
    expect(after.o?.status).toBe("refunded");
    expect(after.t.length).toBe(0);
  });

  it("Pix pago depois da reserva vencer: com lugar, emite uma vez (o dinheiro já saiu)", async () => {
    const pi = newPi();
    const { o } = await pendingOrder({ status: "expired", pi });
    expect((await post(piEvent(pi, o.id))).status).toBe(200);
    expect((await post(piEvent(pi, o.id))).status).toBe(200);
    const after = await load(o.id);
    expect(after.o?.status).toBe("paid");
    expect(after.o?.paymentRef).toBe(`STRIPE-${pi}`);
    expect(after.t.length).toBe(1);
  });

  it("emissão direta com valor confirmado igual ao pedido emite; diferente, não", async () => {
    const a = await pendingOrder();
    expect((await F.fulfillOrder(a.o.id, { ref: `STRIPE-${newPi()}`, charged: true, paid: { amountCents: 5000, currency: "BRL" } })).ok).toBe(true);
    const b = await pendingOrder();
    const r = await F.fulfillOrder(b.o.id, { ref: `STRIPE-${newPi()}`, charged: true, paid: { amountCents: 5001, currency: "brl" } });
    expect(r.ok).toBe(false);
    expect((await load(b.o.id)).t.length).toBe(0);
  });
});
