import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

type Db = typeof import("@/db");
let D: Db, P: typeof import("@/lib/actions/painel"), E: typeof import("@/lib/actions/eventos");
const events: string[] = [], orgs: string[] = [];
const userOf = (p: string): U => ({ id: qaId(p), email: `${qaId(p)}@example.com`, name: "Pessoa Teste", emailVerified: true });

/** Produtor de verdade (cadastro concluído) com um evento publicado. */
async function producer() {
  const { db, schema } = D;
  const owner = userOf("dono");
  const [org] = await db.insert(schema.organizers).values({ slug: qaId("org"), name: "Produtora QA", ownerUserId: owner.id, onboarding: { city: "x" } as never }).returning();
  orgs.push(org.id);
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA Painel", status: "published", startAt: new Date(Date.now() + 30 * 864e5), organizerId: org.id, createdByUserId: owner.id }).returning();
  events.push(ev.id);
  return { owner, org, ev };
}

describe.skipIf(!TEST_DB)("painel: permissões e integridade (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    P = await import("@/lib/actions/painel");
    E = await import("@/lib/actions/eventos");
  });
  afterAll(async () => {
    session.user = null;
    if (!D) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    if (events.length) {
      await db.delete(schema.orders).where(inArray(schema.orders.eventId, events));
      await db.delete(schema.events).where(inArray(schema.events.id, events));
    }
    if (orgs.length) await db.delete(schema.organizers).where(inArray(schema.organizers.id, orgs));
  });

  it("conta que não é produtora não convida equipe nem cria produtor (S-02)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const buyer = userOf("comprador");
    session.user = buyer;
    const inv = await P.inviteMember(`${qaId("segunda")}@example.com`, "admin");
    const set = await P.saveSettings({ name: "Golpe", slug: qaId("golpe"), contactEmail: "", legalName: "", cnpj: "", payout: { bank: "", agency: "", account: "", kind: "corrente", holder: "", doc: "", pixKey: "" }, defaults: { buyerPaysFee: true, autoMeia: false, age: "Livre", refund: "" } });
    session.user = null;
    // (antes das conferências: se a regra quebrar, o produtor criado é apagado no fim)
    const org = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, buyer.id) });
    if (org) orgs.push(org.id);
    expect(inv.ok).toBe(false);
    expect(set.ok).toBe(false);
    expect(org).toBeUndefined();
  });

  it("produtor aprovado convida normalmente", async () => {
    const { owner } = await producer();
    session.user = owner;
    const r = await P.inviteMember(`${qaId("membro")}@example.com`, "portaria");
    session.user = null;
    expect(r.ok).toBe(true);
  });

  // S-06 mantinha os acessos que o removido criou para outras pessoas; o SEC-401 mudou a regra: o e-mail e o destino
  // desses acessos foram escolhidos por quem saiu, então todos os criados por ele caem (a dona recria o que precisar)
  it("membro removido perde o acesso pessoal de portaria e os que ele criou para outros (S-06, SEC-401)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { owner, org, ev } = await producer();
    const member = userOf("porteiro");
    const [m] = await db.insert(schema.organizerMembers).values({ organizerId: org.id, email: member.email, role: "admin", userId: member.id, acceptedAt: new Date() }).returning();
    // acesso pessoal (como o "Abrir app da portaria" cria: rótulo = e-mail, sem envio) e um criado para outra pessoa
    const [mine] = await db.insert(schema.checkinLinks).values({ eventId: ev.id, token: qaId("t").replace(/-/g, "").padEnd(24, "x"), code: null, label: member.email, createdByUserId: member.id }).returning();
    const [other] = await db.insert(schema.checkinLinks).values({ eventId: ev.id, token: qaId("u").replace(/-/g, "").padEnd(24, "y"), code: null, label: "Portão B", createdByUserId: member.id }).returning();
    session.user = owner;
    const r = await P.removeMember(m.id);
    session.user = null;
    expect(r.ok).toBe(true);
    const a = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, mine.id) });
    const b = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, other.id) });
    expect(a?.revokedAt).not.toBeNull();
    expect(b?.revokedAt).not.toBeNull();
  });

  it("excluir evento com alguém pagando agora é recusado; sem pagamento em andamento, exclui (S-03)", async () => {
    const { db, schema } = D;
    const { eq } = await import("drizzle-orm");
    const { owner, ev } = await producer();
    const [o] = await db.insert(schema.orders).values({ userId: qaId("u"), eventId: ev.id, status: "pending", subtotalCents: 5000, totalCents: 5000, expiresAt: new Date(Date.now() + 10 * 60_000) }).returning();
    session.user = owner;
    const blocked = await E.deleteEvent(ev.id, "QA Painel");
    expect(blocked.ok).toBe(false);
    await db.update(schema.orders).set({ status: "expired", expiresAt: new Date(Date.now() - 3600_000) }).where(eq(schema.orders.id, o.id));
    const done = await E.deleteEvent(ev.id, "QA Painel");
    session.user = null;
    expect(done.ok).toBe(true);
    expect(await db.query.events.findFirst({ where: eq(schema.events.id, ev.id) })).toBeUndefined();
  });
});
