import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-002 (Agente 03, rodada 2): "Entrar com a Apple" numa conta que já existe com o e-mail AINDA NÃO CONFIRMADO não
 * entra nela nem a marca como confirmada. A conta pode ter sido criada por outra pessoa com o e-mail de quem agora usa
 * a Apple (pré-cadastro); entrar e confirmar deixaria a senha do outro valendo numa conta que passa a ser da vítima.
 * O Neon Auth é simulado (sem chamada a terceiros).
 */
const state = vi.hoisted(() => ({ rows: [] as { id: string; emailVerified: boolean | null }[], otpCalls: 0, signUps: 0 }));

vi.mock("@/db", () => {
  const chain = () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) });
  return {
    db: {
      execute: async () => ({ rows: state.rows }),
      insert: chain,
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    },
    schema: { appleOtps: { emailHash: "email_hash", otp: "otp", createdAt: "created_at" }, userProfiles: { userId: "user_id" } },
  };
});
vi.mock("@/lib/mail/data", () => ({ siteUrl: () => "http://localhost:3042" }));
vi.mock("@/lib/notify", () => ({ mailWelcome: async () => true }));
vi.mock("@/lib/mfa", () => ({ rememberDevice: async () => {}, mfaSettings: async () => ({}), issueCode: async () => {}, logSecurity: async () => {} }));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    signUp: { email: async () => { state.signUps++; return { error: { message: "simulado" } }; } },
    emailOtp: { sendVerificationOtp: async () => { state.otpCalls++; return { error: { message: "simulado" } }; } },
    signIn: { emailOtp: async () => ({ error: { message: "simulado" } }) },
  },
}));

const done = { email: "vitima@example.com", sub: "apple-sub-1", name: "Vítima", next: "/", exp: Date.now() + 60_000 };

beforeEach(() => { state.rows = []; state.otpCalls = 0; state.signUps = 0; });

describe("SEC-002: Apple não assume conta existente com e-mail não confirmado", () => {
  it("conta existente sem e-mail confirmado: recusa sem pedir código de entrar ao Neon Auth (pending)", async () => {
    const { completeAppleSignIn } = await import("@/lib/auth/apple");
    state.rows = [{ id: "u1", emailVerified: false }];
    const r = await completeAppleSignIn(done);
    expect(r).toMatchObject({ ok: false, pending: true });
    expect(state.otpCalls).toBe(0);
    state.rows = [{ id: "u1", emailVerified: null }];
    expect(await completeAppleSignIn(done)).toMatchObject({ ok: false, pending: true });
    expect(state.otpCalls).toBe(0);
  });

  it("controles: conta confirmada segue para o código de entrar; e-mail novo segue para o cadastro", async () => {
    const { completeAppleSignIn } = await import("@/lib/auth/apple");
    state.rows = [{ id: "u1", emailVerified: true }];
    const a = await completeAppleSignIn(done);
    expect(a.ok).toBe(false);
    expect("pending" in a && a.pending).toBeFalsy();
    expect(state.otpCalls).toBe(1);
    state.rows = [];
    const b = await completeAppleSignIn(done);
    expect("pending" in b && b.pending).toBeFalsy();
    expect(state.signUps).toBe(1);
  });

  it("a volta da Apple manda para /entrar com o aviso de conta não ativada", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "x" }), delete: () => {} }) }));
    vi.doMock("@/lib/email", () => ({ logEmails: async () => {} }));
    vi.doMock("@/lib/auth/apple", () => ({
      APPLE_DONE_COOKIE: "tw_apple_ok",
      openApple: async () => done,
      completeAppleSignIn: async () => ({ ok: false, why: "conta existente com e-mail não confirmado", pending: true }),
    }));
    const { finishAppleSignIn } = await import("@/lib/actions/apple");
    expect(await finishAppleSignIn()).toBe("/entrar?next=%2F&apple=pendente");
  });
});
