import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));

/*
 * SEC-301 (banco de teste): o contador de tentativas é atômico no Postgres. Com N pedidos ao mesmo tempo, exatamente
 * `max` reservas passam (o KV deixava passar todos). As linhas "try:" ficam fora do histórico de segurança da conta.
 */
let A: typeof import("@/lib/attempts"), D: typeof import("@/db");
const subjects: string[] = [];
const subject = () => { const s = qaId("tentativas"); subjects.push(s); return s; };

describe.skipIf(!TEST_DB)("contador atômico de tentativas (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    A = await import("@/lib/attempts");
  });
  afterAll(async () => {
    if (!D || !subjects.length) return;
    const { inArray } = await import("drizzle-orm");
    await D.db.delete(D.schema.securityEvents).where(inArray(D.schema.securityEvents.userId, subjects));
  });

  it("30 tentativas ao mesmo tempo com máximo 6: passam exatamente 6, numeradas de 1 a 6", async () => {
    const s = subject();
    const r = await Promise.all(Array.from({ length: 30 }, () => A.reserveAttempt(s, "totp", 6, 300)));
    const ok = r.filter((x) => x.ok) as { ok: true; n: number }[];
    expect(ok).toHaveLength(6);
    expect(ok.map((x) => x.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    // a recusa não grava linha: continua recusando, e o balde de outra finalidade não é afetado
    expect((await A.reserveAttempt(s, "totp", 6, 300)).ok).toBe(false);
    expect((await A.reserveAttempt(s, "code:login", 5, 600)).ok).toBe(true);
  });

  it("zerar o balde libera de novo (código certo); a janela vale (linha antiga não conta)", async () => {
    const s = subject();
    for (let i = 0; i < 3; i++) expect((await A.reserveAttempt(s, "code:bank", 3, 600)).ok).toBe(true);
    expect((await A.reserveAttempt(s, "code:bank", 3, 600)).ok).toBe(false);
    await A.clearAttempts(s, "code:bank");
    expect(await A.reserveAttempt(s, "code:bank", 3, 600)).toEqual({ ok: true, n: 1 });
    // tentativas de 10 min atrás não contam numa janela de 5 min
    const { and, eq, sql } = await import("drizzle-orm");
    const t = D.schema.securityEvents;
    await D.db.update(t).set({ createdAt: sql`now() - interval '10 minutes'` }).where(and(eq(t.userId, s), eq(t.kind, "try:code:bank")));
    expect(await A.reserveAttempt(s, "code:bank", 1, 300)).toEqual({ ok: true, n: 1 });
  });

  it("as tentativas não aparecem no histórico de segurança da pessoa", async () => {
    const s = subject();
    await A.reserveAttempt(s, "totp", 6, 300);
    await D.db.insert(D.schema.securityEvents).values({ userId: s, kind: "login", detail: "teste" });
    const { listSecurityEvents } = await import("@/lib/data/conta");
    const list = await listSecurityEvents(s);
    expect(list.map((x) => x.kind)).toEqual(["login"]);
  });
});
