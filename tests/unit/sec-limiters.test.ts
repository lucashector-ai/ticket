import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Agente 05 (defesa contra ataques automatizados): regressão dos limitadores que já existem, com o KV,
 * o banco e o envio de e-mail simulados. Nenhum pedido vai ao login real (Neon Auth), ao Resend ou ao KV.
 *
 * Os testes marcados com `it.fails` descrevem lacunas abertas (docs/security/findings/bots.md):
 * hoje o comportamento esperado NÃO acontece, então o teste "falha como previsto". Quando o AppSec
 * corrigir (fase 2), eles passam a falhar de verdade: troque `it.fails` por `it`.
 *   SEC-301: tentativas de código (e-mail e app autenticador) contadas com ler-e-gravar no KV (corrigido pelo AppSec:
 *            contador atômico no banco, reservado antes de comparar; viraram `it`)
 *   SEC-302: limitador genérico (`allowHit`) não é atômico e libera quando o KV recusa a escrita (corrigido pelo
 *            AppSec: usa o contador atômico do banco e falha fechada; viraram `it`)
 */

/* ---------- KV simulado (com latência opcional e falha de escrita opcional) ---------- */
const kv = new Map<string, { v: string; until: number }>();
const kvMode = { latency: false, failPut: false };
const tick = () => new Promise<void>((r) => setImmediate(r));
const fakeKv = {
  get: async (k: string, type?: string) => {
    if (kvMode.latency) await tick();
    const e = kv.get(k);
    const v = e && e.until > Date.now() ? e.v : null;
    return v != null && type === "json" ? JSON.parse(v) : v;
  },
  put: async (k: string, v: string, o?: { expirationTtl?: number }) => {
    if (kvMode.latency) { await tick(); await tick(); }
    if (kvMode.failPut) throw new Error("KV PUT failed: 429 Too Many Requests");
    kv.set(k, { v, until: Date.now() + (o?.expirationTtl ?? 1e9) * 1000 });
  },
  delete: async (k: string) => void kv.delete(k),
};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { KV: fakeKv } }) }));

/* ---------- cabeçalhos, segredo, e-mail e banco simulados ---------- */
const reqHeaders = new Map<string, string>([["cf-connecting-ip", "203.0.113.7"]]);
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => reqHeaders.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
// segredo de teste no chaveiro real (src/lib/signing-secret.ts), sem TW_SIGNING_SECRET: o caminho de hoje
process.env.NEON_AUTH_COOKIE_SECRET = "segredo-de-teste-agente-05";
delete process.env.TW_SIGNING_SECRET;
const mailed: { to: string; code: string; purpose: string }[] = [];
vi.mock("@/lib/notify", () => ({
  mailMfaCode: async (to: string, code: string, purpose: string) => { mailed.push({ to, code, purpose }); return true; },
}));
const profile: { mfaMethod: string | null; mfaTotp: string | null; mfaRecovery: string[]; email: string; name: string } = {
  mfaMethod: null, mfaTotp: null, mfaRecovery: [], email: "teste+agente05@example.com", name: "Conta Fictícia",
};
vi.mock("@/db", async () => ({
  db: {
    query: { userProfiles: { findFirst: async () => { if (kvMode.latency) await tick(); return { ...profile }; } } },
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
  schema: await vi.importActual("@/db/schema"),
}));

/* contador atômico de tentativas (no servidor, uma transação no Postgres; ver tests/db/attempts.test.ts). Aqui, em
 * memória: a soma acontece antes de qualquer await, então é atômica como a do banco. O que o teste confere é que
 * checkCode/checkSecondFactor reservam a tentativa ANTES de comparar o palpite. */
const tries = new Map<string, number[]>();
const counter = { down: false };
vi.mock("@/lib/attempts", () => ({
  countAttempts: async (subject: string, bucket: string, windowSec: number) => {
    if (counter.down) throw new Error("banco fora");
    return (tries.get(`${subject}|${bucket}`) ?? []).filter((t) => t > Date.now() - windowSec * 1000).length;
  },
  reserveAttempt: async (subject: string, bucket: string, max: number, windowSec: number) => {
    if (counter.down) throw new Error("banco fora");
    const k = `${subject}|${bucket}`, now = Date.now();
    const list = (tries.get(k) ?? []).filter((t) => t > now - windowSec * 1000);
    if (list.length >= max) { tries.set(k, list); return { ok: false }; }
    list.push(now); tries.set(k, list);
    return { ok: true, n: list.length };
  },
  clearAttempts: async (subject: string, bucket: string) => { tries.delete(`${subject}|${bucket}`); },
}));

/* TOTP de referência (RFC 6238), independente do código testado */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function unb32(s: string) {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totpAt(secretB32: string, ms: number) {
  const counter = Math.floor(ms / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", unb32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/** um código de 6 dígitos que com certeza não é o certo */
const wrongOf = (right: string) => String((Number(right) + 500_000) % 1_000_000).padStart(6, "0");

const USER = "00000000-0000-4000-8000-0000000000a5";

beforeEach(() => {
  kv.clear(); tries.clear(); counter.down = false; mailed.length = 0; kvMode.latency = false; kvMode.failPut = false;
  Object.assign(profile, { mfaMethod: null, mfaTotp: null, mfaRecovery: [] });
  vi.useFakeTimers({ now: new Date("2026-10-31T12:00:10Z"), toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("limitador genérico (src/lib/rate-limit.ts)", () => {
  it("allowHit: deixa passar até o máximo, recusa depois; outra chave não é afetada; volta depois da janela", async () => {
    const { allowHit } = await import("@/lib/rate-limit");
    const r: boolean[] = [];
    for (let i = 0; i < 14; i++) r.push(await allowHit(`pedido:${USER}`, 12, 600));
    expect(r.filter(Boolean)).toHaveLength(12);
    expect(r.slice(12)).toEqual([false, false]);
    expect(await allowHit("pedido:outra-conta", 12, 600)).toBe(true);
    vi.setSystemTime(Date.now() + 601_000);
    expect(await allowHit(`pedido:${USER}`, 12, 600)).toBe(true);
  });

  it("limitReached só lê; addHit conta (padrão do cupom: só o errado gasta a cota)", async () => {
    const { addHit, limitReached } = await import("@/lib/rate-limit");
    for (let i = 0; i < 50; i++) expect(await limitReached("cupom:203.0.113.7", 20)).toBe(false); // ler não conta
    for (let i = 0; i < 20; i++) await addHit("cupom:203.0.113.7", 600);
    expect(await limitReached("cupom:203.0.113.7", 20)).toBe(true);
    expect(await limitReached("cupom:198.51.100.1", 20)).toBe(false);
  });

  it("clientIp usa o cf-connecting-ip (o da Cloudflare) antes do x-forwarded-for", async () => {
    const { clientIp } = await import("@/lib/rate-limit");
    reqHeaders.set("x-forwarded-for", "10.0.0.1, 10.0.0.2");
    expect(await clientIp()).toBe("203.0.113.7");
    reqHeaders.delete("cf-connecting-ip");
    expect(await clientIp()).toBe("10.0.0.1");
    reqHeaders.set("cf-connecting-ip", "203.0.113.7");
    reqHeaders.delete("x-forwarded-for");
  });

  it("SEC-302: 30 pedidos simultâneos com máximo 12 deixam passar no máximo 12", async () => {
    const { allowHit } = await import("@/lib/rate-limit");
    kvMode.latency = true;
    const r = await Promise.all(Array.from({ length: 30 }, () => allowHit(`pedido:${USER}`, 12, 600)));
    expect(r.filter(Boolean).length).toBeLessThanOrEqual(12);
  });

  it("SEC-302: com o contador fora do ar (antes: o KV recusando a escrita), o limitador não libera tudo (falha fechada)", async () => {
    const { allowHit, limitReached } = await import("@/lib/rate-limit");
    kvMode.failPut = true;
    counter.down = true;
    const r: boolean[] = [];
    for (let i = 0; i < 20; i++) r.push(await allowHit(`signup:203.0.113.7`, 12, 3600));
    expect(r.filter(Boolean).length).toBeLessThanOrEqual(12);
    expect(await limitReached("cupom:203.0.113.7", 20)).toBe(true);
  });
});

describe("códigos por e-mail (src/lib/mfa.ts: issueCode / checkCode)", () => {
  it("30 s entre envios do mesmo tipo e no máximo 8 por hora somando todos os tipos", async () => {
    const { issueCode } = await import("@/lib/mfa");
    expect((await issueCode(USER, "login", profile.email)).ok).toBe(true);
    const again = await issueCode(USER, "login", profile.email);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toMatch(/^Aguarde \d+s para pedir outro código\.$/);
    const purposes = ["setup", "off", "email", "newemail", "bank", "login", "setup"] as const;
    for (const p of purposes) { vi.setSystemTime(Date.now() + 31_000); expect((await issueCode(USER, p, profile.email)).ok).toBe(true); }
    vi.setSystemTime(Date.now() + 31_000);
    const ninth = await issueCode(USER, "off", profile.email);
    expect(ninth).toEqual({ ok: false, error: "Muitos códigos pedidos. Tente de novo daqui a uma hora." });
    expect(mailed).toHaveLength(8);
  });

  it("5 códigos errados apagam o código (nem o certo vale depois); o certo na 5ª tentativa ainda vale", async () => {
    const { checkCode, issueCode } = await import("@/lib/mfa");
    await issueCode(USER, "login", profile.email);
    const right = mailed[0].code, wrong = wrongOf(right);
    for (let i = 0; i < 4; i++) {
      const r = await checkCode(USER, "login", wrong);
      expect(r).toEqual({ ok: false, error: `Código incorreto. Você tem mais ${4 - i} tentativa${4 - i === 1 ? "" : "s"}.` });
    }
    expect(await checkCode(USER, "login", wrong)).toEqual({ ok: false, error: "Código incorreto várias vezes. Peça um novo código." });
    expect(await checkCode(USER, "login", right)).toEqual({ ok: false, error: "O código expirou. Peça um novo." });

    vi.setSystemTime(Date.now() + 31_000);
    await issueCode(USER, "login", profile.email);
    const right2 = mailed[1].code;
    for (let i = 0; i < 4; i++) await checkCode(USER, "login", wrongOf(right2));
    expect(await checkCode(USER, "login", right2)).toEqual({ ok: true, to: profile.email });
  });

  it("código certo vale uma vez só, só para o mesmo tipo e expira em 10 min", async () => {
    const { checkCode, issueCode } = await import("@/lib/mfa");
    await issueCode(USER, "bank", profile.email);
    const right = mailed[0].code;
    expect((await checkCode(USER, "login", right)).ok).toBe(false); // código do banco não serve no login
    expect((await checkCode(USER, "bank", right)).ok).toBe(true);
    expect((await checkCode(USER, "bank", right)).ok).toBe(false); // reaproveitar não vale
    vi.setSystemTime(Date.now() + 31_000);
    await issueCode(USER, "bank", profile.email);
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1000);
    expect(await checkCode(USER, "bank", mailed[1].code)).toEqual({ ok: false, error: "O código expirou. Peça um novo." });
  });

  it("SEC-301: 20 códigos errados enviados ao mesmo tempo não passam de 5 conferências", async () => {
    const { checkCode, issueCode } = await import("@/lib/mfa");
    await issueCode(USER, "login", profile.email);
    const wrong = wrongOf(mailed[0].code);
    kvMode.latency = true;
    const r = await Promise.all(Array.from({ length: 20 }, () => checkCode(USER, "login", wrong)));
    // conferidas = respostas "Código incorreto..." (as que compararam o palpite com o código guardado)
    const checked = r.filter((x) => !x.ok && x.error.startsWith("Código incorreto")).length;
    expect(checked).toBeLessThanOrEqual(5);
  });
});

describe("app autenticador (src/lib/mfa.ts: checkSecondFactor / verifyTotp)", () => {
  async function withTotp() {
    const { newTotpSecret, sealSecret } = await import("@/lib/mfa");
    const secret = newTotpSecret();
    Object.assign(profile, { mfaMethod: "totp", mfaTotp: await sealSecret(secret) });
    return secret;
  }

  it("código certo entra; o mesmo código não entra de novo (anti-reuso)", async () => {
    const { checkSecondFactor } = await import("@/lib/mfa");
    const secret = await withTotp();
    const code = totpAt(secret, Date.now());
    expect(await checkSecondFactor(USER, "login", code)).toEqual({ ok: true, how: "totp" });
    expect((await checkSecondFactor(USER, "login", code)).ok).toBe(false);
  });

  it("6 erros em 5 min bloqueiam (até o código certo); depois de 5 min volta", async () => {
    const { checkSecondFactor } = await import("@/lib/mfa");
    const secret = await withTotp();
    const right = totpAt(secret, Date.now());
    // errado também para as janelas vizinhas (o app aceita 30 s de diferença)
    const wrong = ["000000", "111111", "222222", "333333"].find((c) => ![-30_000, 0, 30_000].some((d) => totpAt(secret, Date.now() + d) === c))!;
    for (let i = 0; i < 6; i++) expect((await checkSecondFactor(USER, "login", wrong)).ok).toBe(false);
    expect(await checkSecondFactor(USER, "login", right)).toEqual({ ok: false, error: "Muitas tentativas. Espere 5 minutos e tente de novo." });
    vi.setSystemTime(Date.now() + 301_000);
    expect(await checkSecondFactor(USER, "login", totpAt(secret, Date.now()))).toEqual({ ok: true, how: "totp" });
  });

  it("SEC-301: 30 tentativas simultâneas no app autenticador não passam de 6 conferências", async () => {
    const { checkSecondFactor } = await import("@/lib/mfa");
    const secret = await withTotp();
    const wrong = ["000000", "111111", "222222", "333333"].find((c) => ![-30_000, 0, 30_000].some((d) => totpAt(secret, Date.now() + d) === c))!;
    kvMode.latency = true;
    const r = await Promise.all(Array.from({ length: 30 }, () => checkSecondFactor(USER, "login", wrong)));
    const checked = r.filter((x) => !x.ok && x.error.startsWith("Código incorreto")).length;
    expect(checked).toBeLessThanOrEqual(6);
  });
});
