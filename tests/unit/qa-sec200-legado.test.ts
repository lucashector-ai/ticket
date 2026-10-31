import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Agente 06 (validação independente do SEC-200). O teste do AppSec (signing-keys.test.ts) compara o QR e a cifra do
 * app com o algoritmo antigo. Este vai além: reimplementa AQUI, linha a linha, as contas do código de antes da
 * correção (commit 2865fda: signing-secret, qr, mfa, bank, portaria) e confere, pelas funções públicas de hoje, que
 * TUDO o que foi emitido antes continua aceito:
 *   A) sem nenhuma variável nova (como a produção está hoje): QR, app autenticador, códigos de recuperação, código por
 *      e-mail, cookie da segunda etapa, cookie do banco e cookie da portaria, todos idênticos aos de antes;
 *   B) com TW_SIGNING_SECRET (passo 1 do plano): os antigos continuam aceitos; o segredo do app é recifrado;
 *   C) depois da troca do segredo do login (TW_LEGACY_SECRET = antigo, passo 3): QR, app, recuperação e portaria
 *      continuam; banco, segunda etapa e código por e-mail (minutos) deixam de valer, como o plano diz.
 * Em todos, uma assinatura com outro segredo é recusada.
 */

const OLD = "segredo-antigo-do-login-qa06";
const NEW_LOGIN = "segredo-do-login-trocado-qa06";
const TW = "segredo-novo-so-da-tickets-win-qa06";
const USER = "qa-test-sec200-user";

/* ---- código de 2865fda, copiado das funções privadas de então ---- */
const old = {
  qr: (code: string, secret: string, s = OLD) => `ONDE|${code}|${createHmac("sha256", s).update(`${code}:${secret}`).digest("base64url").slice(0, 16)}`,
  mac: (msg: string, s = OLD) => createHmac("sha256", s).update(msg).digest("base64url").slice(0, 32),
  hashCode: (userId: string, purpose: string, code: string, s = OLD) => createHash("sha256").update(`${s}:${userId}:${purpose}:${code}`).digest("base64url"),
  rcHash: (userId: string, c: string, s = OLD) => createHash("sha256").update(`${s}:rc:${userId}:${c.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`).digest("base64url"),
  bankMac: (msg: string, s = OLD) => createHmac("sha256", s).update(`banco:${msg}`).digest("base64url").slice(0, 32),
  portariaSign: (id: string, s = OLD) => createHmac("sha256", s).update(`portaria:${id}`).digest("base64url").slice(0, 32),
  async seal(plain: string, s = OLD) {
    const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${s}:totp`));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
    return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
  },
};

/** Código atual do app autenticador (RFC 6238, 30 s, 6 dígitos). */
function totpNow(b32: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of b32.replace(/[\s=]/g, "")) bits += A.indexOf(c.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/* ---- dublês: banco (perfil e acesso da portaria), KV, cookies ---- */
const state = vi.hoisted(() => ({
  profile: null as null | Record<string, unknown>,
  link: null as null | Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  kv: new Map<string, string>(),
  jar: new Map<string, string>(),
}));
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const chain = { set: (v: Record<string, unknown>) => { state.updates.push(v); return { where: async () => ({ rowCount: 1 }) }; } };
  return {
    schema,
    db: {
      query: {
        userProfiles: { findFirst: async () => state.profile },
        checkinLinks: { findFirst: async () => state.link },
      },
      update: () => chain,
    },
  };
});
vi.mock("@/lib/attempts", () => ({ reserveAttempt: async () => ({ ok: true, n: 1 }), clearAttempts: async () => {}, countAttempts: async () => 0 }));
vi.mock("@/lib/notify", () => ({ mailMfaCode: async () => true }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (k: string) => (state.jar.has(k) ? { name: k, value: state.jar.get(k)! } : undefined), set: () => {}, delete: () => {} }),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { KV: { get: async (k: string, t?: string) => { const v = state.kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void state.kv.set(k, v), delete: async (k: string) => void state.kv.delete(k) } },
  }),
}));

const SECRET_B32 = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const RC_CODE = "ABCD-EFGH";
const LINK_ID = "11111111-2222-4333-8444-555555555555";

/** Artefatos emitidos ANTES da correção (com o segredo antigo). */
async function legacyArtifacts() {
  return {
    qr: old.qr("TW-ABCD-EFGH", "s3cr3t"),
    sealed: await old.seal(SECRET_B32),
    rc: old.rcHash(USER, RC_CODE),
    emailHash: old.hashCode(USER, "login", "123456"),
    mfaCookie: old.mac("pass:sessao-qa06"),
    bankCookie: (() => { const exp = Date.now() + 10 * 60e3; return `${USER}.${exp}.${old.bankMac(`${USER}:${exp}`)}`; })(),
    portariaCookie: `${LINK_ID}.${old.portariaSign(LINK_ID)}`,
  };
}

async function load() {
  vi.resetModules();
  return {
    Q: await import("@/lib/tickets/qr"),
    M: await import("@/lib/mfa"),
    Bk: await import("@/lib/bank"),
    P: await import("@/lib/portaria"),
  };
}

/** Confere cada artefato antigo pelas funções públicas de hoje. */
async function check(a: Awaited<ReturnType<typeof legacyArtifacts>>) {
  const { Q, M, Bk, P } = await load();
  const out: Record<string, boolean> = {};
  out.qr = Q.qrPayloadMatches("TW-ABCD-EFGH", "s3cr3t", a.qr);
  // app autenticador: segredo cifrado pelo código antigo + código atual do app
  state.profile = { mfaMethod: "totp", mfaTotp: a.sealed, mfaRecovery: [a.rc], email: "x@example.com", name: "QA" };
  state.kv.clear(); state.updates = [];
  out.totp = (await M.checkSecondFactor(USER, "login", totpNow(SECRET_B32))).ok;
  out.totpRecifrado = state.updates.some((u) => typeof u.mfaTotp === "string" && u.mfaTotp !== a.sealed);
  // código de recuperação gerado antes
  state.profile = { mfaMethod: "totp", mfaTotp: a.sealed, mfaRecovery: [a.rc], email: "x@example.com", name: "QA" };
  out.recuperacao = (await M.checkSecondFactor(USER, "login", RC_CODE)).ok;
  // código por e-mail emitido antes (hash guardado no KV)
  state.kv.set(`mfa:login:${USER}`, JSON.stringify({ h: a.emailHash, n: 0, at: Date.now(), to: "x@example.com" }));
  out.codigoEmail = (await M.checkCode(USER, "login", "123456")).ok;
  // cookie da segunda etapa
  state.jar.clear(); state.jar.set("tw_mfa", a.mfaCookie);
  out.cookieSegundaEtapa = await M.sessionCleared("sessao-qa06");
  // cookie do banco
  state.jar.clear(); state.jar.set("tw_banco", a.bankCookie);
  out.cookieBanco = (await Bk.bankUserId()) === USER;
  // cookie do aparelho da portaria
  state.jar.clear(); state.jar.set("tw_portaria", a.portariaCookie);
  state.link = { id: LINK_ID, revokedAt: null, event: { id: "e", title: "QA", slug: "qa", flyerId: null, status: "published", startAt: new Date(Date.now() + 3600e3), endAt: null, dateLabel: "" } };
  out.cookiePortaria = !!(await P.portariaSession());
  return out;
}

describe("Agente 06 · SEC-200: o que foi emitido antes da correção continua valendo", () => {
  beforeEach(() => { vi.stubEnv("NEON_AUTH_COOKIE_SECRET", OLD); vi.stubEnv("TW_SIGNING_SECRET", ""); vi.stubEnv("TW_SIGNING_SECRET_OLD", ""); vi.stubEnv("TW_LEGACY_SECRET", ""); });
  afterEach(() => { vi.unstubAllEnvs(); state.jar.clear(); state.kv.clear(); });

  it("A) sem variável nova: tudo idêntico ao código antigo (QR, app, recuperação, código por e-mail, cookies de 2ª etapa, banco e portaria)", async () => {
    const a = await legacyArtifacts();
    const { Q, P } = await load();
    // o que sai hoje é byte a byte o que saía antes
    expect(await Q.qrPayload("TW-ABCD-EFGH", "s3cr3t")).toBe(a.qr);
    expect(P.portariaCookie(LINK_ID).value).toBe(a.portariaCookie);
    const r = await check(a);
    expect(r).toEqual({ qr: true, totp: true, totpRecifrado: false, recuperacao: true, codigoEmail: true, cookieSegundaEtapa: true, cookieBanco: true, cookiePortaria: true });
  });

  it("B) com TW_SIGNING_SECRET (passo 1): tudo o que é antigo continua aceito e o segredo do app é recifrado no primeiro uso", async () => {
    const a = await legacyArtifacts();
    vi.stubEnv("TW_SIGNING_SECRET", TW);
    const { Q } = await load();
    expect(await Q.qrPayload("TW-ABCD-EFGH", "s3cr3t")).not.toBe(a.qr);
    const r = await check(a);
    expect(r).toEqual({ qr: true, totp: true, totpRecifrado: true, recuperacao: true, codigoEmail: true, cookieSegundaEtapa: true, cookieBanco: true, cookiePortaria: true });
  });

  it("C) depois da troca do segredo do login (passo 3): QR, app, recuperação e portaria continuam; banco, 2ª etapa e código por e-mail não", async () => {
    const a = await legacyArtifacts();
    vi.stubEnv("TW_SIGNING_SECRET", TW);
    vi.stubEnv("TW_LEGACY_SECRET", OLD);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", NEW_LOGIN);
    const r = await check(a);
    expect(r).toEqual({ qr: true, totp: true, totpRecifrado: true, recuperacao: true, codigoEmail: false, cookieSegundaEtapa: false, cookieBanco: false, cookiePortaria: true });
  });

  it("controle: artefatos assinados com outro segredo são recusados nos três cenários", async () => {
    const forged = {
      qr: old.qr("TW-ABCD-EFGH", "s3cr3t", "outro"),
      sealed: await old.seal(SECRET_B32, "outro"),
      rc: old.rcHash(USER, RC_CODE, "outro"),
      emailHash: old.hashCode(USER, "login", "123456", "outro"),
      mfaCookie: old.mac("pass:sessao-qa06", "outro"),
      bankCookie: (() => { const exp = Date.now() + 10 * 60e3; return `${USER}.${exp}.${old.bankMac(`${USER}:${exp}`, "outro")}`; })(),
      portariaCookie: `${LINK_ID}.${old.portariaSign(LINK_ID, "outro")}`,
    };
    const none = async () => {
      const { Q, M, Bk, P } = await load();
      expect(Q.qrPayloadMatches("TW-ABCD-EFGH", "s3cr3t", forged.qr)).toBe(false);
      state.profile = { mfaMethod: "totp", mfaTotp: forged.sealed, mfaRecovery: [forged.rc] };
      await expect(M.checkSecondFactor(USER, "login", totpNow(SECRET_B32))).rejects.toThrow();
      state.profile = { mfaMethod: "totp", mfaTotp: forged.sealed, mfaRecovery: [forged.rc] };
      expect((await M.checkSecondFactor(USER, "login", RC_CODE)).ok).toBe(false);
      state.kv.set(`mfa:login:${USER}`, JSON.stringify({ h: forged.emailHash, n: 0, at: Date.now(), to: "x@example.com" }));
      expect((await M.checkCode(USER, "login", "123456")).ok).toBe(false);
      state.jar.clear(); state.jar.set("tw_mfa", forged.mfaCookie);
      expect(await M.sessionCleared("sessao-qa06")).toBe(false);
      state.jar.clear(); state.jar.set("tw_banco", forged.bankCookie);
      expect(await Bk.bankUserId()).toBeNull();
      state.jar.clear(); state.jar.set("tw_portaria", forged.portariaCookie);
      state.link = { id: LINK_ID, revokedAt: null, event: { status: "published", startAt: new Date(Date.now() + 3600e3), endAt: null } };
      expect(await P.portariaSession()).toBeNull();
    };
    await none();
    vi.stubEnv("TW_SIGNING_SECRET", TW);
    await none();
    vi.stubEnv("TW_LEGACY_SECRET", OLD);
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", NEW_LOGIN);
    await none();
  });
});
