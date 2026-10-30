import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "../db/setup";
import { pct, timed } from "./stats";

/*
 * Carga na portaria: N ingressos lidos em sequência rápida por DOIS operadores ao mesmo tempo (cada QR passa nos
 * dois leitores quase juntos, como numa fila com duas portas). Rodadas de 10, 50 e 100 ingressos (20/100/200
 * leituras simultâneas). Confere: cada ingresso entra uma vez só, a segunda leitura diz "já utilizado", nenhuma
 * exceção; mede p50/p95 da leitura.
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let D: typeof import("@/db"), K: typeof import("@/lib/checkin"), Q: typeof import("@/lib/tickets/qr");
const created: string[] = [];
const ROUNDS = (process.env.LOAD_ROUNDS ?? "10,50,100").split(",").map(Number);
const code = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = randomBytes(8); let s = ""; for (const x of b) s += a[x % a.length]; return `TW-${s.slice(0, 4)}-${s.slice(4)}`; };

describe.skipIf(!TEST_DB)("carga: portaria (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    K = await import("@/lib/checkin");
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

  for (const n of ROUNDS) {
    it(`${n} ingressos, dois operadores lendo cada um ao mesmo tempo`, async () => {
      const { db, schema } = D;
      const { eq, and, count } = await import("drizzle-orm");
      const [ev] = await db.insert(schema.events).values({ slug: qaId("carga-portaria"), title: "QA carga · portaria", status: "published", startAt: new Date(Date.now() + 3_600_000) }).returning();
      created.push(ev.id);
      const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 0, quantity: n }).returning();
      const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: "paid", paymentMethod: "free", paymentRef: "TEST-carga", paidAt: new Date() }).returning();
      const rows = Array.from({ length: n }, () => ({ code: code(), orderId: o.id, eventId: ev.id, ticketTypeId: tt.id, holderUserId: o.userId, holderName: "Pessoa Teste", secret: randomBytes(16).toString("hex") }));
      await db.insert(schema.tickets).values(rows);
      const qrs = await Promise.all(rows.map((r) => Q.qrPayload(r.code, r.secret)));
      const lat: number[] = [];
      let okN = 0, used = 0, other = 0, errors = 0;
      const allowed = new Set([ev.id]);
      const t0 = performance.now();
      await Promise.all(qrs.flatMap((qr, i) => ["Porta A", "Porta B"].map(async (who, k) => {
        // sequência rápida: cada leitura começa alguns ms depois da anterior, as duas portas quase juntas
        await new Promise((r) => setTimeout(r, i * 5 + k));
        const r = await timed(() => K.checkinTicket(qr, allowed, who));
        lat.push(r.ms);
        if (r.err) errors++;
        else if (r.v!.ok) okN++;
        else if (/já utilizado|Já entrou/i.test(r.v!.error ?? "")) used++;
        else other++;
      })));
      const wall = Math.round(performance.now() - t0);
      const [u] = await db.select({ n: count() }).from(schema.tickets).where(and(eq(schema.tickets.eventId, ev.id), eq(schema.tickets.status, "used")));
      console.log(`CARGA portaria n=${n} leituras=${2 * n} | p50=${pct(lat, 50)}ms p95=${pct(lat, 95)}ms | total ${wall}ms | liberados=${okN} já_usado=${used} outras=${other} exceções=${errors} | usados no banco=${u.n}`);
      expect(errors).toBe(0);
      expect(okN).toBe(n);
      expect(used).toBe(n);
      expect(Number(u.n)).toBe(n);
    });
  }
});
