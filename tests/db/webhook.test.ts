import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

/*
 * Webhook da Stripe sem rede: chaves falsas só deste teste; a assinatura é conferida localmente com o mesmo
 * segredo. Só eventos que não chamam a API da Stripe (confirmação com lugar; cancelamento).
 */
const SECRET = "whsec_teste_local_auditoria";
let D: typeof import("@/db"), W: typeof import("@/app/api/webhooks/stripe/route");
const created: string[] = [];
const prevKey = process.env.STRIPE_SECRET_KEY, prevHook = process.env.STRIPE_WEBHOOK_SECRET;

function post(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return W.POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
}
const piEvent = (type: string, pi: string, orderId: string) => ({ id: `evt_${qaId("e").slice(-10)}`, object: "event", type, livemode: false, data: { object: { id: pi, object: "payment_intent", metadata: { orderId }, amount: 5000, amount_received: 5000, currency: "brl", livemode: false } } });

describe.skipIf(!TEST_DB)("webhook da Stripe (banco de teste, sem rede)", () => {
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_falsa_so_para_o_teste";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    D = await import("@/db");
    W = await import("@/app/api/webhooks/stripe/route");
  });
  afterAll(async () => {
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

  async function pendingOrder() {
    const { db, schema } = D;
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA webhook", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning();
    created.push(ev.id);
    const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 10 }).returning();
    const [o] = await db.insert(schema.orders).values({
      userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 5000, totalCents: 5000, paymentMethod: "pix",
      expiresAt: new Date(Date.now() + 15 * 60_000), holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
    }).returning();
    await db.insert(schema.orderItems).values({ orderId: o.id, ticketTypeId: tt.id, quantity: 1, unitPriceCents: 5000 });
    return { ev, o };
  }
  const load = async (id: string) => {
    const { eq } = await import("drizzle-orm");
    const o = await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, id) });
    const t = await D.db.query.tickets.findMany({ where: eq(D.schema.tickets.orderId, id) });
    return { o, t };
  };

  it("assinatura errada: 400 e nada muda", async () => {
    const { o } = await pendingOrder();
    const r = await post(piEvent("payment_intent.succeeded", "pi_qa_falso", o.id), "whsec_outro");
    expect(r.status).toBe(400);
    expect((await load(o.id)).o?.status).toBe("pending");
  });

  it("confirmação emite uma vez; repetida não duplica; cancelamento fora de ordem não desfaz", async () => {
    const { o } = await pendingOrder();
    const pi = `pi_qa_${qaId("p").slice(-8)}`;
    const ok = await post(piEvent("payment_intent.succeeded", pi, o.id));
    expect(ok.status).toBe(200);
    const again = await post(piEvent("payment_intent.succeeded", pi, o.id));
    expect(again.status).toBe(200);
    const late = await post(piEvent("payment_intent.canceled", pi, o.id));
    expect(late.status).toBe(200);
    const { o: after, t } = await load(o.id);
    expect(after?.status).toBe("paid");
    expect(after?.paymentRef).toBe(`STRIPE-${pi}`);
    expect(after?.stripePaymentIntentId).toBe(pi);
    expect(t.length).toBe(1);
  });

  it("cancelamento de pedido ainda pendente: vira expirado", async () => {
    const { o } = await pendingOrder();
    const r = await post(piEvent("payment_intent.canceled", `pi_qa_${qaId("c").slice(-8)}`, o.id));
    expect(r.status).toBe(200);
    expect((await load(o.id)).o?.status).toBe("expired");
  });
});
