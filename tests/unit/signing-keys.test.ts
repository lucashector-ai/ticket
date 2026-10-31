import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-200: chaves por finalidade derivadas de TW_SIGNING_SECRET, com o segredo antigo aceito na conferência.
 * Sem a variável nova, tudo continua idêntico (QR já enviado, 2FA cadastrado, portaria).
 */
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/notify", () => ({ mailMfaCode: async () => true }));
vi.mock("@/lib/attempts", () => ({ reserveAttempt: async () => ({ ok: true, n: 1 }), clearAttempts: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: { KV: { get: async () => null, put: async () => {} } } }) }));

const OLD = "segredo-antigo-do-login";
const legacyQr = (code: string, secret: string) => `ONDE|${code}|${createHmac("sha256", OLD).update(`${code}:${secret}`).digest("base64url").slice(0, 16)}`;

describe("SEC-200: chaves por finalidade", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("sem TW_SIGNING_SECRET: QR e segredo do app exatamente como antes (nada quebra sem variável nova)", async () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", OLD);
    vi.stubEnv("TW_SIGNING_SECRET", "");
    const Q = await import("@/lib/tickets/qr");
    expect(await Q.qrPayload("TW-ABCD-EFGH", "s3cr3t")).toBe(legacyQr("TW-ABCD-EFGH", "s3cr3t"));
    // cifra antiga: AES-GCM com SHA-256("<segredo>:totp")
    const M = await import("@/lib/mfa");
    const sealed = await M.sealSecret("JBSWY3DPEHPK3PXP");
    const key = await crypto.subtle.importKey("raw", createHash("sha256").update(`${OLD}:totp`).digest(), "AES-GCM", false, ["decrypt"]);
    const [iv, ct] = sealed.split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64url") }, key, Buffer.from(ct, "base64url"));
    expect(new TextDecoder().decode(pt)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("com TW_SIGNING_SECRET: QR novo usa a chave derivada; o QR já enviado continua valendo; QR forjado não", async () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", OLD);
    vi.stubEnv("TW_SIGNING_SECRET", "segredo-novo-so-da-tickets-win");
    const Q = await import("@/lib/tickets/qr");
    const fresh = await Q.qrPayload("TW-ABCD-EFGH", "s3cr3t");
    expect(fresh).not.toBe(legacyQr("TW-ABCD-EFGH", "s3cr3t"));
    expect(Q.qrPayloadMatches("TW-ABCD-EFGH", "s3cr3t", fresh)).toBe(true);
    expect(Q.qrPayloadMatches("TW-ABCD-EFGH", "s3cr3t", legacyQr("TW-ABCD-EFGH", "s3cr3t"))).toBe(true);
    expect(Q.qrPayloadMatches("TW-ABCD-EFGH", "outro", fresh)).toBe(false);
    // as finalidades não se misturam
    const S = await import("@/lib/signing-secret");
    expect(S.currentKey("qr").value).not.toEqual(S.currentKey("banco").value);
  });

  it("depois da troca do segredo do login (TW_LEGACY_SECRET = antigo): QR, app e portaria aceitam o antigo; banco e 2FA da sessão não", async () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "segredo-do-login-ja-trocado");
    vi.stubEnv("TW_SIGNING_SECRET", "segredo-novo-so-da-tickets-win");
    vi.stubEnv("TW_LEGACY_SECRET", OLD);
    const S = await import("@/lib/signing-secret");
    const raws = (p: Parameters<typeof S.acceptedKeys>[0]) => S.acceptedKeys(p).filter((k) => k.kind === "raw").map((k) => k.value);
    expect(raws("qr")).toEqual([OLD]);
    expect(raws("totp")).toEqual([OLD]);
    expect(raws("portaria")).toEqual([OLD]);
    expect(raws("recovery")).toEqual([OLD]);
    expect(raws("banco")).toEqual([]);
    expect(raws("mfa")).toEqual([]);
    // nenhuma finalidade aceita o segredo novo do login
    for (const p of ["qr", "totp", "portaria", "recovery", "banco", "mfa"] as const) expect(raws(p)).not.toContain("segredo-do-login-ja-trocado");
    const Q = await import("@/lib/tickets/qr");
    expect(Q.qrPayloadMatches("TW-ABCD-EFGH", "s3cr3t", legacyQr("TW-ABCD-EFGH", "s3cr3t"))).toBe(true);
  });

  it("segredo do app cifrado com a chave antiga abre com a nova configuração e é marcado para recifrar; TW_SIGNING_SECRET_OLD vale na troca do segredo novo", async () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", OLD);
    vi.stubEnv("TW_SIGNING_SECRET", "");
    const M = await import("@/lib/mfa");
    const legacySealed = await M.sealSecret("JBSWY3DPEHPK3PXP");
    vi.stubEnv("TW_SIGNING_SECRET", "segredo-novo-1");
    expect(await M.openSecretWith(legacySealed)).toEqual({ plain: "JBSWY3DPEHPK3PXP", stale: true });
    const fresh = await M.sealSecret("JBSWY3DPEHPK3PXP");
    expect(await M.openSecretWith(fresh)).toEqual({ plain: "JBSWY3DPEHPK3PXP", stale: false });
    vi.stubEnv("TW_SIGNING_SECRET", "segredo-novo-2");
    vi.stubEnv("TW_SIGNING_SECRET_OLD", "segredo-novo-1");
    expect((await M.openSecretWith(fresh)).plain).toBe("JBSWY3DPEHPK3PXP");
    vi.stubEnv("TW_SIGNING_SECRET_OLD", "");
    vi.stubEnv("TW_LEGACY_SECRET", "outro");
    await expect(M.openSecretWith(fresh)).rejects.toThrow();
  });

  it("só o login e o chaveiro leem NEON_AUTH_COOKIE_SECRET", () => {
    const files = execSync("git grep -l NEON_AUTH_COOKIE_SECRET -- src", { encoding: "utf8" }).trim().split("\n").sort();
    expect(files).toEqual(["src/lib/auth/server.ts", "src/lib/signing-secret.ts"]);
    expect(readFileSync("src/lib/signing-secret.ts", "utf8")).toContain("hkdf");
  });
});
