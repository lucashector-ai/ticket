import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * D-04 (decisão do dono): trocar a conta de recebimento dos saques exige o código do app autenticador
 * quando a conta usa o app. Sem o app, segue o fluxo de antes (só a sessão, com aviso por e-mail).
 */
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));
// KV em memória (tentativas e proteção contra reuso do código do app)
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));

let D: typeof import("@/db"), P: typeof import("@/lib/actions/painel"), M: typeof import("@/lib/mfa");
const orgs: string[] = [], users: string[] = [];

/** Código atual do app autenticador (RFC 6238, 30 s, 6 dígitos). */
function totpNow(b32: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of b32.replace(/=+$/, "")) bits += A.indexOf(c.toUpperCase()).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function producer(withApp: boolean) {
  const { db, schema } = D;
  const id = qaId("dono");
  users.push(id);
  const owner: U = { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true };
  const [org] = await db.insert(schema.organizers).values({
    slug: qaId("org"), name: "Produtora QA", ownerUserId: id, onboarding: { city: "x" } as never,
    payout: { bank: "Banco A", agency: "0001", account: "12345-6", kind: "corrente", holder: "Pessoa Teste", doc: "", pixKey: "" } as never,
  }).returning();
  orgs.push(org.id);
  await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA saque", status: "published", startAt: new Date(Date.now() + 30 * 864e5), organizerId: org.id, createdByUserId: id });
  const secret = M.newTotpSecret();
  await db.insert(schema.userProfiles).values({ userId: id, email: owner.email, mfaMethod: withApp ? "totp" : null, mfaTotp: withApp ? await M.sealSecret(secret) : null });
  return { owner, org, secret };
}

const form = (slug: string, account: string, code?: string) => ({
  name: "Produtora QA", slug, contactEmail: "", legalName: "", cnpj: "",
  payout: { bank: "Banco A", agency: "0001", account, kind: "corrente" as const, holder: "Pessoa Teste", doc: "", pixKey: "" },
  defaults: { buyerPaysFee: true, autoMeia: false, age: "Livre" as const, refund: "" }, ...(code !== undefined ? { code } : {}),
});

async function accountOf(orgId: string) {
  const { eq } = await import("drizzle-orm");
  const o = await D.db.query.organizers.findFirst({ where: eq(D.schema.organizers.id, orgId) });
  return (o?.payout as { account?: string } | null)?.account;
}

describe.skipIf(!TEST_DB)("conta de recebimento × app autenticador (D-04, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    P = await import("@/lib/actions/painel");
    M = await import("@/lib/mfa");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (orgs.length) {
      await db.delete(schema.events).where(inArray(schema.events.organizerId, orgs));
      await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
    }
    if (users.length) {
      await db.delete(schema.userProfiles).where(inArray(schema.userProfiles.userId, users));
      await db.delete(schema.securityEvents).where(inArray(schema.securityEvents.userId, users));
    }
  });

  it("com o app: sem código, com código errado ou de recuperação não troca; com o código do app troca", async () => {
    const { owner, org, secret } = await producer(true);
    session.user = owner;
    const none = await P.saveSettings(form(org.slug, "99999-9"));
    expect(none).toMatchObject({ ok: false, needsCode: true });
    const wrong = await P.saveSettings(form(org.slug, "99999-9", totpNow(secret) === "000000" ? "111111" : "000000"));
    expect(wrong).toMatchObject({ ok: false, needsCode: true });
    const recovery = await P.saveSettings(form(org.slug, "99999-9", "ABCD-EFGH"));
    expect(recovery).toMatchObject({ ok: false, needsCode: true });
    expect(await accountOf(org.id)).toBe("12345-6");
    const right = await P.saveSettings(form(org.slug, "99999-9", totpNow(secret)));
    expect(right.ok).toBe(true);
    expect(await accountOf(org.id)).toBe("99999-9");
    // mudar outra coisa (sem mexer no destino) não pede o código
    expect((await P.saveSettings({ ...form(org.slug, "99999-9"), name: "Produtora QA 2" })).ok).toBe(true);
    session.user = null;
  });

  it("sem o app: troca como antes (aviso por e-mail e registro de segurança)", async () => {
    const { owner, org } = await producer(false);
    session.user = owner;
    expect((await P.saveSettings(form(org.slug, "77777-7"))).ok).toBe(true);
    expect(await accountOf(org.id)).toBe("77777-7");
    session.user = null;
  });
});
