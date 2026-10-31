import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Agente 06 · SEC-400 (achado novo da validação do SEC-302/SEC-307): os freios do tipo "só o erro conta"
 * (`limitReached` para conferir + `addHit` depois do erro) usam o contador atômico, mas a DECISÃO não é atômica:
 * pedidos simultâneos leem a contagem antes de qualquer erro ser somado, e todos conferem o palpite.
 * Afeta o código de acesso da portaria (8 erros por IP em 15 min) e o cupom (20 erros por IP em 10 min).
 *
 * Os testes "rajada" afirmam o comportamento SEGURO. Eram `it.fails`; com a correção (Agente 03, rodada 2: a
 * tentativa é reservada antes de conferir com `reserveMiss` e devolvida no acerto) viraram `it` comuns.
 * O controle em sequência mostra que o freio funciona sem concorrência.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const net = vi.hoisted(() => ({ ip: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "cf-connecting-ip": net.ip }),
}));
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

let D: typeof import("@/db");
const ips: string[] = [], created: string[] = [];
const freshIp = () => { const ip = qaId("ip"); ips.push(ip); net.ip = ip; return ip; };
const TOO_MANY = /Muitas tentativas/;

describe.skipIf(!TEST_DB)("Agente 06 · SEC-400: freios \"só o erro conta\" sob rajada (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    const subjects = ips.flatMap((ip) => [`portaria-try:${ip}`, `cupom:${ip}`]);
    if (subjects.length) await db.delete(schema.securityEvents).where(inArray(schema.securityEvents.userId, subjects));
    if (created.length) await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("controle (em sequência): o 9º código errado da portaria é recusado pelo freio", async () => {
    const { enterWithCode } = await import("@/lib/actions/portaria");
    freshIp();
    const rs = [];
    for (let i = 0; i < 9; i++) rs.push(await enterWithCode("ZZZZ-ZZZZ"));
    expect(rs.slice(0, 8).every((r) => !r.ok && !TOO_MANY.test(r.error))).toBe(true);
    expect(rs[8]).toMatchObject({ ok: false, error: expect.stringMatching(TOO_MANY) });
  });

  it("rajada: 40 códigos errados da portaria ao mesmo tempo, do mesmo IP, não passam de 8 conferências", async () => {
    const { enterWithCode } = await import("@/lib/actions/portaria");
    freshIp();
    const rs = await Promise.all(Array.from({ length: 40 }, () => enterWithCode("ZZZZ-ZZZZ")));
    const checked = rs.filter((r) => !r.ok && !TOO_MANY.test(r.error)).length;
    console.log("[SEC-400 portaria]", JSON.stringify({ enviados: 40, conferidos: checked, limite: 8 }));
    expect(checked).toBeLessThanOrEqual(8);
  });

  it("rajada: 50 cupons errados ao mesmo tempo, do mesmo IP, não passam de 20 conferências", async () => {
    const { db, schema } = D;
    const C = await import("@/lib/actions/compra");
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA cupom rajada", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
    created.push(ev.id);
    freshIp();
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => C.checkCoupon(`QA06X${i}`, ev.slug)));
    const checked = rs.filter((r) => !r.ok && !TOO_MANY.test(r.error)).length;
    console.log("[SEC-400 cupom]", JSON.stringify({ enviados: 50, conferidos: checked, limite: 20 }));
    expect(checked).toBeLessThanOrEqual(20);
  });

  it("Agente 03 (SEC-400): acerto devolve a reserva: 30 conferências seguidas de um cupom que vale não travam o IP", async () => {
    const { db, schema } = D;
    const C = await import("@/lib/actions/compra");
    const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA cupom acerto", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
    created.push(ev.id);
    const code = qaId("OK").slice(-12).toUpperCase();
    await db.insert(schema.coupons).values({ eventId: ev.id, code, percentOff: 10 });
    freshIp();
    for (let i = 0; i < 30; i++) expect(await C.checkCoupon(code, ev.slug)).toMatchObject({ ok: true, code });
    // os erros continuam contados normalmente depois dos acertos
    const misses = await Promise.all(Array.from({ length: 25 }, (_, i) => C.checkCoupon(`QA03X${i}`, ev.slug)));
    expect(misses.filter((r) => !r.ok && !TOO_MANY.test(r.error))).toHaveLength(20);
    expect(await C.checkCoupon(code, ev.slug)).toMatchObject({ ok: false, error: expect.stringMatching(TOO_MANY) });
  });
});
