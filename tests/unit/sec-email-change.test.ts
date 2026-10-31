import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-309: trocar o e-mail não serve para descobrir quais e-mails têm conta. E-mail de outra conta recebe a mesma
 * resposta (sem código), e cada e-mail novo tentado conta (10 por dia por conta). Banco, KV e envio simulados.
 */
const state = { taken: false };
const issued: string[] = [];
vi.mock("@/db", () => ({ db: { execute: async () => ({ rows: state.taken ? [{ "?column?": 1 }] : [] }) }, schema: { userProfiles: {} } }));
vi.mock("@/lib/auth/server", () => ({
  getAuthState: async () => ({ user: { id: "u-email", email: "eu@example.com", name: "Eu", emailVerified: true }, sessionId: "s", token: "t", pending: false }),
  auth: {},
}));
vi.mock("@/lib/mfa", () => ({
  hasStep: async () => true, mfaSettings: async () => ({ name: "Eu" }),
  issueCode: async (_u: string, _p: string, to: string) => { issued.push(to); return { ok: true }; },
}));
vi.mock("@/lib/notify", () => ({ mailSecurityNotice: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
const tries = new Map<string, number>();
vi.mock("@/lib/attempts", () => ({
  reserveAttempt: async (subject: string, bucket: string, max: number) => {
    const k = `${subject}|${bucket}`, n = (tries.get(k) ?? 0) + 1;
    if (n > max) return { ok: false };
    tries.set(k, n);
    return { ok: true, n };
  },
  countAttempts: async () => 0,
}));

describe("SEC-309: troca de e-mail sem oráculo de contas", () => {
  beforeEach(() => { tries.clear(); issued.length = 0; state.taken = false; });

  it("e-mail que já é de outra conta recebe a mesma resposta de um livre (e nenhum código sai para ele)", async () => {
    const A = await import("@/lib/actions/conta");
    const free = await A.requestNewEmail("livre@example.com");
    state.taken = true;
    const taken = await A.requestNewEmail("ocupado@example.com");
    expect(taken).toEqual(free);
    expect(issued).toEqual(["livre@example.com"]);
  });

  it("10 e-mails novos por dia por conta; o 11º é recusado antes de qualquer conferência", async () => {
    const A = await import("@/lib/actions/conta");
    for (let i = 0; i < 10; i++) expect((await A.requestNewEmail(`n${i}@example.com`)).ok).toBe(true);
    const r = await A.requestNewEmail("n10@example.com");
    expect(r).toEqual({ ok: false, error: "Muitas tentativas de troca de e-mail hoje. Tente de novo amanhã." });
    expect(issued).toHaveLength(10);
  });
});
