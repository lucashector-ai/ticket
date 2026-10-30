import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "../db/setup";
import { cpfOf, pct, timed } from "./stats";

/*
 * Carga na abertura de vendas: N compradores ao mesmo tempo no MESMO tipo de ingresso (estoque menor que N),
 * cada um fazendo o caminho do checkout no servidor: placeOrder (reserva) → confirmPayment (Pix de teste → emissão).
 * Rodadas de 10, 50 e 100 simultâneos. Mede p50/p95 de cada etapa e confere no fim: vendido ≤ estoque,
 * ingressos emitidos = vendido = pedidos pagos, nenhuma exceção.
 * Sem HTTP e sem login: o login é o da produção (regra da auditoria); a sessão de cada comprador é simulada.
 * Limites por IP/conta (KV) ficam desligados aqui (sem Cloudflare), para medir o banco e as travas.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => { throw new Error("sem Cloudflare no teste de carga"); } }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const als = new AsyncLocalStorage<U>();
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => als.getStore() ?? null }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra");
const created: string[] = [], users: string[] = [];
const ROUNDS = (process.env.LOAD_ROUNDS ?? "10,50,100").split(",").map(Number);

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("carga: abertura de vendas (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
  });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (created.length) {
      await db.delete(schema.tickets).where(inArray(schema.tickets.eventId, created));
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
      await db.delete(schema.events).where(inArray(schema.events.id, created));
    }
    if (users.length) for (let i = 0; i < users.length; i += 200) await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users.slice(i, i + 200)));
  });

  for (const n of ROUNDS) {
    it(`${n} compradores ao mesmo tempo pelos últimos ${Math.round(n * 0.6)} ingressos`, async () => {
      const { db, schema } = D;
      const { eq, and, count } = await import("drizzle-orm");
      const stock = Math.round(n * 0.6);
      const [ev] = await db.insert(schema.events).values({ slug: qaId("carga"), title: "QA carga · abertura", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
      created.push(ev.id);
      const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: stock, maxPerOrder: 4 }).returning();
      const place: number[] = [], confirm: number[] = [];
      let soldOut = 0, otherNo = 0, errors = 0;
      const msgs = new Map<string, number>();
      const t0 = performance.now();
      await Promise.all(Array.from({ length: n }, (_, i) => {
        const id = qaId(`carga${i}`); users.push(id);
        const u: U = { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true };
        return als.run(u, async () => {
          const r = await timed(() => C.placeOrder({
            eventSlug: ev.slug, items: [{ ticketTypeId: tt.id, quantity: 1 }], coupon: null,
            buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: cpfOf(n * 1000 + i) },
            holders: [{ ticketTypeId: tt.id, name: "Pessoa Teste", meia: false, me: true, email: null }],
            method: "pix", installments: 1, groupShareId: null, resaleListingId: null,
          }));
          place.push(r.ms);
          if (r.err) { errors++; msgs.set(String(r.err).slice(0, 80), (msgs.get(String(r.err).slice(0, 80)) ?? 0) + 1); return; }
          const v = r.v!;
          if (!v.ok) { if (/esgot|disponí|acabou|restam/i.test(v.error)) soldOut++; else otherNo++; msgs.set(v.error.slice(0, 80), (msgs.get(v.error.slice(0, 80)) ?? 0) + 1); return; }
          const orderId = (v as { orderId?: string }).orderId;
          if (!orderId) { otherNo++; return; }
          const c = await timed(() => C.confirmPayment(orderId));
          confirm.push(c.ms);
          if (c.err) { errors++; msgs.set(String(c.err).slice(0, 80), (msgs.get(String(c.err).slice(0, 80)) ?? 0) + 1); }
          else if (!c.v!.ok) msgs.set(`confirmar: ${(c.v as { error?: string }).error?.slice(0, 70)}`, (msgs.get(`confirmar: ${(c.v as { error?: string }).error?.slice(0, 70)}`) ?? 0) + 1);
        });
      }));
      const wall = Math.round(performance.now() - t0);
      const t2 = await db.query.ticketTypes.findFirst({ where: eq(schema.ticketTypes.id, tt.id) });
      const [tk] = await db.select({ n: count() }).from(schema.tickets).where(eq(schema.tickets.ticketTypeId, tt.id));
      const [paid] = await db.select({ n: count() }).from(schema.orders).where(and(eq(schema.orders.eventId, ev.id), eq(schema.orders.status, "paid")));
      const line = `CARGA vendas n=${n} estoque=${stock} | placeOrder p50=${pct(place, 50)}ms p95=${pct(place, 95)}ms | confirmar p50=${pct(confirm, 50)}ms p95=${pct(confirm, 95)}ms (${confirm.length}) | total ${wall}ms | vendidos=${t2!.sold} ingressos=${tk.n} pagos=${paid.n} esgotado=${soldOut} outras_recusas=${otherNo} exceções=${errors}`;
      console.log(line);
      if (msgs.size) console.log("  mensagens:", JSON.stringify(Object.fromEntries(msgs)));
      expect(errors).toBe(0);
      expect(t2!.sold).toBeLessThanOrEqual(stock);
      expect(Number(tk.n)).toBe(t2!.sold);
      expect(Number(paid.n)).toBe(t2!.sold);
    });
  }
});
