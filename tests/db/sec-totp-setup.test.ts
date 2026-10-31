import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-004 (banco de teste): cadastrar o app autenticador prova antes o fator atual. Com código por e-mail (ou sem
 * duas etapas), o QR só sai com o código mandado ao e-mail da conta. O envio é simulado (o código fica no teste).
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined), set: (k: string, v: string) => { jar.set(k, v); }, delete: (k: string) => { jar.delete(k); } }),
  headers: async () => new Headers(),
}));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({
  getSessionUser: async () => session.user,
  getAuthState: async () => (session.user ? { user: session.user, sessionId: `sess-${session.user.id}`, token: `tok-${session.user.id}`, pending: false } : { user: null, sessionId: null, token: null, pending: false }),
  auth: { updateUser: async () => null },
}));
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string, t?: string) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));
const codes: string[] = [];
vi.mock("@/lib/notify", async (orig) => ({ ...(await orig<typeof import("@/lib/notify")>()), mailMfaCode: async (_to: string, code: string) => { codes.push(code); return true; }, mailSecurityNotice: async () => true }));

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

let D: typeof import("@/db"), A: typeof import("@/lib/actions/conta");
const users: string[] = [];
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };

describe.skipIf(!TEST_DB)("SEC-004: trocar para o app autenticador exige o fator atual (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    A = await import("@/lib/actions/conta");
  });
  afterAll(async () => {
    if (!D || !users.length) return;
    const { inArray } = await import("drizzle-orm");
    await D.db.delete(D.schema.securityEvents).where(inArray(D.schema.securityEvents.userId, users));
    await D.db.delete(D.schema.userProfiles).where(inArray(D.schema.userProfiles.userId, users));
  });

  it("com 2FA por e-mail: sem código não sai QR; código errado também não; com o código do e-mail cadastra", async () => {
    const id = qaId("totp"); users.push(id);
    const u: U = { id, email: `${id}@example.com`, name: "Pessoa", emailVerified: true };
    await D.db.insert(D.schema.userProfiles).values({ userId: id, email: u.email, name: u.name, mfaMethod: "email" });
    codes.length = 0;
    const first = await as(u, () => A.startTotp());
    expect(first).toMatchObject({ ok: true, needEmail: true });
    expect(first.key).toBeUndefined();
    expect(codes).toHaveLength(1);
    const wrong = String((Number(codes[0]) + 1) % 1_000_000).padStart(6, "0");
    const bad = await as(u, () => A.startTotp(wrong));
    expect(bad.ok).toBe(false);
    const good = await as(u, () => A.startTotp(codes[0]));
    expect(good.ok).toBe(true);
    expect(good.key).toBeTruthy();
    const done = await as(u, () => A.confirmTotp(totpNow(good.key!.replace(/\s/g, ""))));
    expect(done.ok).toBe(true);
    const { eq } = await import("drizzle-orm");
    expect((await D.db.query.userProfiles.findFirst({ where: eq(D.schema.userProfiles.userId, id) }))?.mfaMethod).toBe("totp");
  });
});
