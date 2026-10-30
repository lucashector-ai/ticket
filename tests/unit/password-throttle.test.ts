import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * S-23: "Esqueci a senha" e "reenviar ativação" não podem virar um jeito de encher a caixa de entrada de
 * outra pessoa. Regra: 30 s entre pedidos e no máximo 6 por hora para o mesmo e-mail.
 * Testado só no limitador e na ação com o login (Neon Auth) simulado: nenhum pedido vai ao login real.
 */
const kv = new Map<string, { v: string; until: number }>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      KV: {
        get: async (k: string) => { const e = kv.get(k); return e && e.until > Date.now() ? e.v : null; },
        put: async (k: string, v: string, o?: { expirationTtl?: number }) => void kv.set(k, { v, until: Date.now() + (o?.expirationTtl ?? 1e9) * 1000 }),
        delete: async (k: string) => void kv.delete(k),
      },
    },
  }),
}));
const sent: string[] = [];
vi.mock("@/lib/auth/server", () => ({
  auth: { emailOtp: { sendVerificationOtp: async ({ email }: { email: string }) => { sent.push(email); return {}; } } },
  getAuthState: async () => ({ user: null, pending: false }),
}));
vi.mock("@/lib/email", () => ({ logEmails: async () => {} }));
vi.mock("@/lib/notify", () => ({ mailPasswordChanged: async () => {} }));
vi.mock("@/lib/mfa", () => ({ logSecurity: async () => {}, maskEmail: (e: string) => e }));
vi.mock("next/server", () => ({ after: () => {} }));

describe("limite do \"esqueci a senha\" (S-23)", () => {
  beforeEach(() => { kv.clear(); sent.length = 0; vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00Z"), toFake: ["Date"] }); });
  afterEach(() => vi.useRealTimers());

  it("30 s entre pedidos para o mesmo e-mail (maiúsculas não contam como outro e-mail)", async () => {
    const { linkThrottled } = await import("@/lib/password-link");
    expect(await linkThrottled("pessoa@example.com")).toBe(false);
    expect(await linkThrottled("PESSOA@example.com")).toBe(true);
    vi.setSystemTime(Date.now() + 29_000);
    expect(await linkThrottled("pessoa@example.com")).toBe(true);
    vi.setSystemTime(Date.now() + 2_000);
    expect(await linkThrottled("pessoa@example.com")).toBe(false);
  });

  it("no máximo 6 por hora para o mesmo e-mail, mesmo respeitando os 30 s; outro e-mail não é afetado; depois de 1 h volta", async () => {
    const { linkThrottled } = await import("@/lib/password-link");
    const tries: boolean[] = [];
    for (let i = 0; i < 8; i++) { tries.push(await linkThrottled("alvo@example.com")); vi.setSystemTime(Date.now() + 31_000); }
    expect(tries).toEqual([false, false, false, false, false, false, true, true]);
    expect(await linkThrottled("outra@example.com")).toBe(false);
    vi.setSystemTime(Date.now() + 3600_000);
    expect(await linkThrottled("alvo@example.com")).toBe(false);
  });

  it("a ação: depois do limite não pede mais código ao login e avisa para aguardar", async () => {
    const { requestPasswordLink } = await import("@/lib/actions/senha");
    const rs = [];
    for (let i = 0; i < 7; i++) { rs.push(await requestPasswordLink("Alvo@Example.com")); vi.setSystemTime(Date.now() + 31_000); }
    expect(rs.slice(0, 6).every((r) => r.ok)).toBe(true);
    expect(rs[6]).toEqual({ ok: false, error: "Aguarde um pouco antes de pedir outro link." });
    expect(sent).toEqual(Array(6).fill("alvo@example.com"));
  });
});
