import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * Red Team (fase 1 da operação de segurança): reproduções das falhas registradas em
 * docs/security/findings/red-team.md. Cada `it.fails` afirma o comportamento SEGURO e hoje falha porque a falha
 * existe; quando o AppSec corrigir, o teste passa a falhar como "it.fails" e deve virar `it` comum (regressão).
 *   SEC-001 · conta da equipe (portaria/admin) conclui o "cadastro do produtor aprovado" e vira produtor sem aprovação
 *             (corrigido pelo AppSec: `it` comum, regressão)
 *   SEC-003 · ex-admin da equipe continua com os acessos da portaria que viu no painel (tokens não mudam na saída)
 *             (corrigido pelo AppSec: `it` comum, regressão)
 *   SEC-004 · sessão com 2FA por e-mail troca para um app autenticador novo sem o código do e-mail
 *             (corrigido pelo AppSec: `it` comum; o caminho com o código certo está em sec-totp-setup.test.ts)
 * Só contas fictícias "qa-test-…" com e-mail @example.com, sem login real (sessão simulada).
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
  requireUser: async () => { if (!session.user) throw new Error("UNAUTHENTICATED"); return session.user; },
  // sessão já liberada na segunda etapa (como alguém com o cookie de sessão de outra pessoa)
  getAuthState: async () => (session.user ? { user: session.user, sessionId: `sess-${session.user.id}`, token: `tok-${session.user.id}`, pending: false } : { user: null, sessionId: null, token: null, pending: false }),
  auth: { updateUser: async () => null },
}));
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string, t?: string) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));

let D: typeof import("@/db");
const users: string[] = [], orgs: string[] = [];
const person = (p: string): U => { const id = qaId(p); users.push(id); return { id, email: `${id}@example.com`, name: `Pessoa ${p}`, emailVerified: true }; };
const as = async <T,>(u: U, fn: () => Promise<T>) => { session.user = u; try { return await fn(); } finally { session.user = null; } };

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

async function approvedOrg(owner: U) {
  const { db, schema } = D;
  const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: `Produtora QA ${owner.id.slice(-6)}`, ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
  orgs.push(org.id);
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA evento red team", status: "published", startAt: new Date(Date.now() + 20 * 864e5), organizerId: org.id, createdByUserId: owner.id }).returning();
  return { org, ev };
}

describe.skipIf(!TEST_DB)("red team: autorização e conta (banco de teste)", () => {
  beforeAll(async () => { D = await import("@/db"); });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray, or } = await import("drizzle-orm");
    const own = users.length ? await db.select({ id: schema.organizers.id }).from(schema.organizers).where(inArray(schema.organizers.ownerUserId, users)) : [];
    const all = [...new Set([...orgs, ...own.map((o) => o.id)])];
    if (all.length || users.length) await db.delete(schema.events).where(or(all.length ? inArray(schema.events.organizerId, all) : undefined, users.length ? inArray(schema.events.createdByUserId, users) : undefined));
    if (all.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, all));
    if (users.length) await db.delete(schema.securityEvents).where(inArray(schema.securityEvents.userId, users));
  });

  it("SEC-001: quem só é da portaria (ou admin) de outra produtora NÃO conclui o cadastro de produtor aprovado nem cria evento próprio", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const O = await import("@/lib/actions/onboarding");
    const C = await import("@/lib/actions/criar");
    const { producerStatus } = await import("@/lib/producer-apply");
    const { emptyDraft } = await import("@/lib/criar/model");
    const owner = person("dona"), staff = person("portaria");
    const { org } = await approvedOrg(owner);
    // a dona convida a conta para a portaria (sem inscrição de produtor, sem aprovação da central)
    expect(await as(owner, () => P.inviteMember(staff.email, "portaria"))).toMatchObject({ ok: true });
    const before = await producerStatus(staff);
    // a página /produtores/cadastro abre para ela (status "producer") e a ação finishOnboarding aceita
    const done = await as(staff, () => O.finishOnboarding({ name: `QA Produtora Propria ${staff.id.slice(-6)}`, city: "Recife", uf: "PE", instagram: "", tagline: "" }));
    const mine = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, staff.id) });
    // a dona tira a pessoa da equipe: a produtora própria aprovada continua
    const m = await db.query.organizerMembers.findFirst({ where: eq(schema.organizerMembers.organizerId, org.id) });
    if (m) await as(owner, () => P.removeMember(m.id));
    const after = await producerStatus(staff);
    const made = await as(staff, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento sem aprovação", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    const ev = made.ok ? await db.query.events.findFirst({ where: eq(schema.events.id, made.eventId), columns: { organizerId: true } }) : null;
    console.log("[SEC-001]", JSON.stringify({
      statusAntes: before.status, cadastro: done.ok, produtoraPropriaComCadastro: !!mine?.onboarding, statusDepoisDeSair: after.status,
      eventoCriado: made.ok, eventoNaProdutoraPropria: !!ev && ev.organizerId === mine?.id,
    }));
    // comportamento seguro esperado
    expect(done.ok).toBe(false);
    expect(mine?.onboarding ?? null).toBeNull();
    expect(made.ok).toBe(false);
  });

  it("SEC-001 (controles): admin da equipe também não conclui o cadastro, mas segue criando evento na produtora da dona; inscrição aprovada e produtor antigo continuam", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const O = await import("@/lib/actions/onboarding");
    const C = await import("@/lib/actions/criar");
    const { producerStatus } = await import("@/lib/producer-apply");
    const { emptyDraft } = await import("@/lib/criar/model");
    const owner = person("dona1b"), admin = person("admin1b"), fresh = person("aprovada1b");
    const { org } = await approvedOrg(owner);
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    expect((await producerStatus(admin)).status).toBe("team");
    const done = await as(admin, () => O.finishOnboarding({ name: `QA Admin Propria ${admin.id.slice(-6)}`, city: "Recife", uf: "PE", instagram: "", tagline: "" }));
    expect(done.ok).toBe(false);
    expect(await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, admin.id) })).toBeUndefined();
    // convite ainda não aceito (nunca abriu o painel): criar evento não dá uma produtora própria a quem só é da equipe
    const early = await as(admin, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento antes do aceite", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    expect(early.ok).toBe(false);
    expect(await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, admin.id) })).toBeUndefined();
    // o trabalho de admin continua: aberto o painel (convite aceito), evento novo vai para a produtora da dona
    const { getPainelScope } = await import("@/lib/data/painel");
    await getPainelScope(admin);
    const made = await as(admin, () => C.saveEvent({ draft: { ...emptyDraft(), title: "QA evento do admin", vis: "rascunho" }, eventId: null, dbMap: {} as never }));
    expect(made.ok).toBe(true);
    if (made.ok) expect((await db.query.events.findFirst({ where: eq(schema.events.id, made.eventId), columns: { organizerId: true } }))?.organizerId).toBe(org.id);
    // evento feito como admin na produtora da dona não transforma o admin em produtor próprio
    expect((await producerStatus(admin)).status).toBe("team");
    // a dona (produtora com cadastro) continua podendo atualizar o cadastro
    expect((await producerStatus(owner)).status).toBe("producer");
    expect((await as(owner, () => O.finishOnboarding({ name: `QA Produtora QA ${owner.id.slice(-6)} Nova`, city: "Recife", uf: "PE", instagram: "", tagline: "" }))).ok).toBe(true);
    // inscrição aprovada (sem equipe) conclui o cadastro
    await db.insert(schema.producerApplications).values({ userId: fresh.id, email: fresh.email, firstName: "Pessoa", lastName: "Aprovada", phone: "11987654321", city: "Recife", uf: "PE", audience: "x", category: "Outro", avgTicketCents: 0, expected: 0, source: "Outro", status: "approved" });
    try {
      expect((await producerStatus(fresh)).status).toBe("approved");
      expect((await as(fresh, () => O.finishOnboarding({ name: `QA Aprovada ${fresh.id.slice(-6)}`, city: "Recife", uf: "PE", instagram: "", tagline: "" }))).ok).toBe(true);
      expect((await producerStatus(fresh)).status).toBe("producer");
    } finally {
      await db.delete(schema.producerApplications).where(eq(schema.producerApplications.userId, fresh.id));
    }
  });

  it("SEC-003: depois que a dona remove o admin, os acessos da portaria que ele via no painel deixam de abrir o app", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const { activeAccess } = await import("@/lib/portaria");
    const owner = person("dona2"), admin = person("admin2");
    const { org, ev } = await approvedOrg(owner);
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    // a dona cria o acesso da portaria do segurança da entrada; o admin vê token e código na tela Equipe
    const link = await as(owner, () => P.createCheckinLink(ev.id, "Segurança da entrada"));
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    const { getPainelScope } = await import("@/lib/data/painel");
    const seen = (await getPainelScope(admin)).events.some((e) => e.id === ev.id);
    const m = await db.query.organizerMembers.findFirst({ where: eq(schema.organizerMembers.organizerId, org.id) });
    expect(await as(owner, () => P.removeMember(m!.id))).toMatchObject({ ok: true });
    const stillOpens = !!(await activeAccess({ token: link.token }));
    const stillCode = !!(await activeAccess({ code: link.code }));
    console.log("[SEC-003]", JSON.stringify({ adminViaOEvento: seen, tokenAindaAbre: stillOpens, codigoAindaAbre: stillCode }));
    expect(stillOpens).toBe(false);
    expect(stillCode).toBe(false);
    // o aparelho da porta já conectado (cookie com o id do acesso) continua lendo; o acesso não foi desligado
    expect(await activeAccess({ id: link.id })).toBeTruthy();
    const now = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, link.id) });
    expect(now?.revokedAt ?? null).toBeNull();
    expect(now?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("SEC-003 (rebaixamento): admin que vira portaria também deixa de abrir com o token e o código que viu", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const P = await import("@/lib/actions/painel");
    const { activeAccess } = await import("@/lib/portaria");
    const owner = person("dona3"), admin = person("admin3");
    const { org, ev } = await approvedOrg(owner);
    expect(await as(owner, () => P.inviteMember(admin.email, "admin"))).toMatchObject({ ok: true });
    const link = await as(owner, () => P.createCheckinLink(ev.id, "Porta 2"));
    if (!link.ok) throw new Error("sem acesso");
    const m = await db.query.organizerMembers.findFirst({ where: eq(schema.organizerMembers.organizerId, org.id) });
    expect(await as(owner, () => P.setMemberRole(m!.id, "portaria"))).toMatchObject({ ok: true });
    expect(await activeAccess({ token: link.token })).toBeNull();
    expect(await activeAccess({ code: link.code })).toBeNull();
    // portaria que vira admin não troca nada (não havia o que esconder)
    const again = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, link.id) });
    expect(await as(owner, () => P.setMemberRole(m!.id, "admin"))).toMatchObject({ ok: true });
    expect((await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, link.id) }))?.token).toBe(again?.token);
  });

  it.fails("SEC-008: criar cupom no próprio evento não revela que um código já existe em evento de OUTRA produtora", async () => {
    const P = await import("@/lib/actions/painel");
    const a = person("prodA"), b = person("prodB");
    const { ev: evA } = await approvedOrg(a);
    const { ev: evB } = await approvedOrg(b);
    const code = `QA${a.id.slice(-6).toUpperCase()}`;
    expect(await as(a, () => P.createCoupon({ eventId: evA.id, code, kind: "pct", value: 50, limit: 0, until: "" }))).toMatchObject({ ok: true });
    // B (outra produtora) tenta o mesmo código no evento dele: a resposta confirma que o código existe em algum evento
    const r = await as(b, () => P.createCoupon({ eventId: evB.id, code, kind: "pct", value: 10, limit: 0, until: "" }));
    console.log("[SEC-008]", JSON.stringify({ resposta: r }));
    expect(r.ok).toBe(true);
  });

  it("SEC-004: com 2FA por e-mail, cadastrar um app autenticador exige o código do e-mail (sessão sozinha não troca o fator)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const A = await import("@/lib/actions/conta");
    const victim = person("vitima2fa");
    await db.insert(schema.userProfiles).values({ userId: victim.id, email: victim.email, name: victim.name, mfaMethod: "email" });
    // quem tem só o cookie da sessão (já liberada) pede o QR do app: não pede código nenhum
    const start = await as(victim, () => A.startTotp());
    const key = start.ok && start.key ? start.key : "";
    const confirm = key ? await as(victim, () => A.confirmTotp(totpNow(key))) : { ok: false };
    const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, victim.id), columns: { mfaMethod: true } });
    console.log("[SEC-004]", JSON.stringify({ startSemCodigo: start.ok, appCadastrado: confirm.ok, metodoAgora: p?.mfaMethod }));
    // sem o código do e-mail não sai QR nem chave (a resposta pede o código: needEmail, ou erro de envio)
    expect(start.ok && !!start.key).toBe(false);
    expect(confirm.ok).toBe(false);
    expect(p?.mfaMethod).toBe("email");
  });
});
