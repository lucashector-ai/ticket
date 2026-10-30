import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));
// sessão do banco e o código do app autenticador simulados (com a demora real da conferência, que abre a
// janela da corrida); saldo, extrato e gravação são os de verdade
// `walletCalls`: com um número, as leituras de saldo além dele "derrubam o Worker" (erro), como uma queda logo
// depois de gravar o saque; `during`: o que acontece enquanto a pessoa digita o código do app
const bank: { userId: string; walletCalls: number | null; during: (() => Promise<void>) | null } = { userId: "", walletCalls: null, during: null };
vi.mock("@/lib/bank", async (orig) => {
  const real = await orig<typeof import("@/lib/bank")>();
  let n = 0;
  return {
    ...real, bankUserId: async () => bank.userId,
    walletFor: async (u: string) => {
      if (bank.walletCalls !== null && ++n > bank.walletCalls) throw new Error("queda simulada");
      return real.walletFor(u);
    },
  };
});
vi.mock("@/lib/mfa", async (orig) => ({ ...(await orig<typeof import("@/lib/mfa")>()), checkSecondFactor: async () => { await new Promise((r) => setTimeout(r, 300)); if (bank.during) await bank.during(); return { ok: true, how: "totp" }; }, logSecurity: async () => {} }));

let D: typeof import("@/db"), B: typeof import("@/lib/actions/banco");
const orgs: string[] = [], events: string[] = [];

describe.skipIf(!TEST_DB)("banco: saque (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    B = await import("@/lib/actions/banco");
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (orgs.length) await db.delete(schema.payoutRequests).where(inArray(schema.payoutRequests.organizerId, orgs));
    if (events.length) await db.delete(schema.orderRefunds).where(inArray(schema.orderRefunds.eventId, events));
    if (events.length) {
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, events));
      await db.delete(schema.events).where(inArray(schema.events.id, events));
    }
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  it("dois saques do saldo inteiro ao mesmo tempo: no máximo um fica (S-04)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const owner = qaId("dono");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA", ownerUserId: owner, payout: { pixKey: "qa@example.com", holder: "QA", doc: "00000000000" } as never }).returning();
    orgs.push(org.id);
    // evento que acabou há 10 dias (saldo liberado) com uma venda real de R$ 100 (taxa paga pelo comprador)
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA saque", status: "published", startAt: new Date(Date.now() - 10 * 864e5), organizerId: org.id, createdByUserId: owner }).returning();
    events.push(ev.id);
    await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: "paid", subtotalCents: 10_000, feeCents: 799, totalCents: 10_799, paymentMethod: "pix", paymentRef: "STRIPE-pi_qa", paidAt: new Date(Date.now() - 12 * 864e5) });
    bank.userId = owner;
    const { walletFor } = await import("@/lib/bank");
    const w = await walletFor(owner);
    expect(w?.available).toBe(10_000);
    const rs = await Promise.all([B.requestPayout(10_000, "123456"), B.requestPayout(10_000, "123456")]);
    const live = await db.query.payoutRequests.findMany({ where: eq(schema.payoutRequests.organizerId, org.id) });
    const active = live.filter((p) => p.status === "requested");
    expect(active.length).toBeLessThanOrEqual(1);
    expect(active.reduce((s, p) => s + p.amountCents, 0)).toBeLessThanOrEqual(10_000);
    expect(rs.filter((r) => r.ok).length).toBe(active.length);
    // depois de tudo, um saque sozinho passa (o saldo não ficou travado)
    if (!active.length) expect((await B.requestPayout(10_000, "123456")).ok).toBe(true);
  });

  /** Produtor com R$ 100 liberados para saque. */
  async function producerWithBalance() {
    const { db, schema } = D;
    const owner = qaId("dono");
    const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA", ownerUserId: owner, payout: { pixKey: "qa@example.com", holder: "QA", doc: "00000000000" } as never }).returning();
    orgs.push(org.id);
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA saque", status: "published", startAt: new Date(Date.now() - 10 * 864e5), organizerId: org.id, createdByUserId: owner }).returning();
    events.push(ev.id);
    const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: "paid", subtotalCents: 10_000, feeCents: 799, totalCents: 10_799, paymentMethod: "pix", paymentRef: "STRIPE-pi_qa", paidAt: new Date(Date.now() - 12 * 864e5) }).returning();
    return { owner, org, ev, o };
  }
  const active = async (orgId: string) => {
    const { eq } = await import("drizzle-orm");
    return (await D.db.query.payoutRequests.findMany({ where: eq(D.schema.payoutRequests.organizerId, orgId) })).filter((p) => p.status === "requested");
  };

  it("queda logo depois de gravar, com dois saques ao mesmo tempo: nunca fica saque acima do saldo (rodada 3)", async () => {
    const { owner, org } = await producerWithBalance();
    bank.userId = owner;
    // cada pedido lê o saldo uma vez; antes, a conferência depois de gravar era uma segunda leitura (aqui ela cai)
    bank.walletCalls = 2;
    const rs = await Promise.all([B.requestPayout(10_000, "123456"), B.requestPayout(10_000, "123456")].map((p) => p.catch(() => ({ ok: false }))));
    bank.walletCalls = null;
    const live = await active(org.id);
    expect(live.length).toBeLessThanOrEqual(1);
    expect(live.reduce((s, p) => s + p.amountCents, 0)).toBeLessThanOrEqual(10_000);
    expect(rs.filter((r) => r.ok).length).toBe(live.length);
  });

  it("reembolso que entra enquanto a pessoa digita o código: o saque não passa do saldo e nada fica gravado", async () => {
    const { owner, org, ev, o } = await producerWithBalance();
    bank.userId = owner;
    bank.during = async () => {
      bank.during = null;
      await D.db.insert(D.schema.orderRefunds).values({ orderId: o.id, eventId: ev.id, idemKey: qaId("rf"), kind: "order", status: "succeeded", amountCents: 6000, producerCents: 6000 });
    };
    const r = await B.requestPayout(10_000, "123456");
    expect(r.ok).toBe(false);
    expect(await active(org.id)).toHaveLength(0);
    // com o saldo novo (R$ 40), o saque cabe
    expect((await B.requestPayout(4000, "123456")).ok).toBe(true);
  });
});
