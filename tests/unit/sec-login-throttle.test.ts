import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-300: freio próprio do login (5 tentativas por e-mail a cada 15 min, reservadas antes de chamar o Neon Auth) e do
 * cadastro (20 por hora por IP, IPv6 pela /64). O Neon Auth, o Turnstile, o banco e o e-mail são simulados: nenhum
 * pedido vai ao login real.
 */
const neon: string[] = [];
let wrongPassword = true;
vi.mock("@/lib/auth/server", () => ({
  auth: {
    signIn: { email: async (c: { email: string }) => { neon.push(`in:${c.email}`); return wrongPassword ? { data: null, error: { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" } } : { data: { user: { id: "u1" }, token: "t" }, error: null }; } },
    signUp: { email: async (c: { email: string }) => { neon.push(`up:${c.email}`); return { data: null, error: { message: "User already exists", code: "X" } }; } },
  },
}));
vi.mock("@/lib/turnstile", () => ({ verifyHuman: async () => true, HUMAN_ERROR: "humano" }));
vi.mock("@/lib/mfa", () => ({ issueCode: async () => ({ ok: true }), logSecurity: async () => {}, mfaSettings: async () => ({ method: null }), rememberDevice: async () => {} }));
vi.mock("@/lib/email", () => ({ emailEnabled: () => false, logEmails: async () => {} }));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("next/server", () => ({ after: () => {} }));
const hdr = new Map<string, string>([["cf-connecting-ip", "203.0.113.5"]]);
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => hdr.get(k) ?? null }), cookies: async () => ({ delete: () => {} }) }));
const tries = new Map<string, number>();
vi.mock("@/lib/attempts", () => ({
  reserveAttempt: async (subject: string, bucket: string, max: number) => {
    const k = `${subject}|${bucket}`, n = (tries.get(k) ?? 0) + 1;
    if (n > max) return { ok: false };
    tries.set(k, n);
    return { ok: true, n };
  },
  clearAttempts: async (subject: string, bucket: string) => { tries.delete(`${subject}|${bucket}`); },
}));

describe("SEC-300: freio do login e do cadastro", () => {
  beforeEach(() => { neon.length = 0; tries.clear(); wrongPassword = true; hdr.set("cf-connecting-ip", "203.0.113.5"); });

  it("login: 5 tentativas por e-mail chegam ao Neon Auth; a 6ª nem é enviada (mensagem igual com ou sem conta)", async () => {
    const A = await import("@/lib/actions/auth");
    const r = [];
    for (let i = 0; i < 7; i++) r.push(await A.signInInline("Vitima@Example.com", "chute", "ok"));
    expect(neon).toHaveLength(5);
    expect(r[4].error).toBe("E-mail ou senha incorretos.");
    expect(r[5].error).toMatch(/^Muitas tentativas de entrar com este e-mail/);
    // outro e-mail não é afetado
    expect((await A.signInInline("outra@example.com", "chute", "ok")).error).toBe("E-mail ou senha incorretos.");
  });

  it("login certo zera a contagem do e-mail", async () => {
    const A = await import("@/lib/actions/auth");
    for (let i = 0; i < 4; i++) await A.signInInline("pessoa@example.com", "errada", "ok");
    wrongPassword = false;
    expect((await A.signInInline("pessoa@example.com", "certa", "ok")).ok).toBe(true);
    wrongPassword = true;
    for (let i = 0; i < 5; i++) expect((await A.signInInline("pessoa@example.com", "errada", "ok")).error).toBe("E-mail ou senha incorretos.");
  });

  it("cadastro: 20 por hora por IP; IPv6 da mesma /64 conta junto", async () => {
    const A = await import("@/lib/actions/auth");
    hdr.set("cf-connecting-ip", "2001:db8:1:2::1");
    for (let i = 0; i < 20; i++) {
      hdr.set("cf-connecting-ip", `2001:db8:1:2::${(i + 1).toString(16)}`);
      await A.signUpInline("Pessoa Teste", `p${i}@example.com`, "senha-boa-123", "(11) 98765-4321", "ok");
    }
    expect(neon).toHaveLength(20);
    hdr.set("cf-connecting-ip", "2001:db8:1:2:ffff::9");
    expect((await A.signUpInline("Pessoa Teste", "p21@example.com", "senha-boa-123", "(11) 98765-4321", "ok")).error).toMatch(/^Muitos cadastros/);
    hdr.set("cf-connecting-ip", "2001:db8:1:3::1");
    expect((await A.signUpInline("Pessoa Teste", "p22@example.com", "senha-boa-123", "(11) 98765-4321", "ok")).error).not.toMatch(/^Muitos cadastros/);
  });

  it("ipKey: IPv4 inteiro, IPv6 reduzido à /64", async () => {
    const { ipKey } = await import("@/lib/login-guard");
    expect(ipKey("203.0.113.5")).toBe("203.0.113.5");
    expect(ipKey("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});
