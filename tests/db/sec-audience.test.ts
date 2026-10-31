import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * SEC-009 / SEC-321 (banco de teste): "excluir quem comprou o evento X" só vale para eventos da própria produtora.
 * Com evento de outra produtora, a contagem não muda (antes revelava se um contato comprou no concorrente).
 */
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => null }));
let D: typeof import("@/db"), M: typeof import("@/lib/mail/data");
const created: string[] = [];

describe.skipIf(!TEST_DB)("SEC-009: público do e-mail marketing (banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    M = await import("@/lib/mail/data");
  });
  afterAll(async () => {
    if (!D || !created.length) return;
    const { inArray } = await import("drizzle-orm");
    await D.db.delete(D.schema.orders).where(inArray(D.schema.orders.eventId, created));
    await D.db.delete(D.schema.events).where(inArray(D.schema.events.id, created));
  });

  it("excluir compradores de evento de outra produtora não muda o público; de evento próprio, exclui", async () => {
    const { db, schema } = D;
    const ev = async () => { const [e] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA público", status: "published", startAt: new Date(Date.now() + 30 * 864e5) }).returning(); created.push(e.id); return e; };
    const mine = await ev(), mine2 = await ev(), theirs = await ev();
    const email = `${qaId("contato")}@example.com`;
    for (const e of [mine, mine2, theirs]) await db.insert(schema.orders).values({ userId: qaId("u"), eventId: e.id, status: "paid", subtotalCents: 1000, totalCents: 1000, buyerEmail: email, buyerName: "Contato" });
    const sender = { orgId: null, userId: qaId("prod") };
    const base = { buyers: "events" as const, buyerEvents: [mine.id], followers: false, signups: false };
    const withTheirs = await M.resolveAudience({ ...base, excludeBuyersOf: [theirs.id] }, sender, [mine.id, mine2.id]);
    expect(withTheirs.map((r) => r.email)).toEqual([email]);
    const withMine = await M.resolveAudience({ ...base, excludeBuyersOf: [mine2.id] }, sender, [mine.id, mine2.id]);
    expect(withMine).toEqual([]);
  });
});
