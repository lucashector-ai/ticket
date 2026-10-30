import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { qaId, TEST_DB } from "./setup";

/*
 * D-03 (decisão do dono): no checkout, caixa desmarcada "Quero receber novidades de <produtor> por e-mail".
 * As campanhas do produtor vão só para quem marcou; pedidos de antes da caixa (producer_opt_in null) seguem
 * recebendo como antes, com o "sair" em um clique.
 */
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
type U = { id: string; email: string; name: string; emailVerified: boolean };
const session: { user: U | null } = { user: null };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => session.user }));

let D: typeof import("@/db"), C: typeof import("@/lib/actions/compra"), M: typeof import("@/lib/mail/data");
const created: string[] = [];
const person = (): U => { const id = qaId("comprador"); return { id, email: `${id}@example.com`, name: "Pessoa Teste", emailVerified: true }; };

async function event() {
  const { db, schema } = D;
  const [ev] = await db.insert(schema.events).values({ slug: qaId("ev"), title: "QA opt-in", status: "published", startAt: new Date(Date.now() + 30 * 864e5), queueMode: "off" }).returning();
  created.push(ev.id);
  const [tt] = await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista", priceCents: 5000, quantity: 50, maxPerOrder: 6 }).returning();
  return { ev, tt };
}
const input = (slug: string, tt: string, u: U, producerOptIn?: boolean) => ({
  eventSlug: slug, items: [{ ticketTypeId: tt, quantity: 1 }], coupon: null,
  buyer: { name: "Pessoa Teste", email: u.email, phone: "(11) 98765-4321", cpf: "529.982.247-25" },
  holders: [{ ticketTypeId: tt, name: "Pessoa Teste", meia: false, me: true, email: null }],
  method: "pix" as const, installments: 1, groupShareId: null, resaleListingId: null, ...(producerOptIn === undefined ? {} : { producerOptIn }),
});

describe.skipIf(!TEST_DB || !!process.env.STRIPE_SECRET_KEY)("opt-in de e-mail do produtor (D-03, banco de teste)", () => {
  beforeAll(async () => {
    D = await import("@/db");
    C = await import("@/lib/actions/compra");
    M = await import("@/lib/mail/data");
  });
  afterAll(async () => {
    session.user = null;
    if (!D || !created.length) return;
    const { db, schema } = D;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.orders).where(inArray(schema.orders.eventId, created));
    await db.delete(schema.events).where(inArray(schema.events.id, created));
  });

  it("o pedido guarda a escolha da caixa; sem marcar, fica desmarcada", async () => {
    const { ev, tt } = await event();
    const { eq } = await import("drizzle-orm");
    const yes = person(), no = person();
    session.user = yes;
    const ry = await C.placeOrder(input(ev.slug, tt.id, yes, true));
    session.user = no;
    const rn = await C.placeOrder(input(ev.slug, tt.id, no));
    session.user = null;
    expect(ry.ok && rn.ok).toBe(true);
    const flag = async (id: string) => (await D.db.query.orders.findFirst({ where: eq(D.schema.orders.id, id) }))?.producerOptIn;
    if (ry.ok) expect(await flag(ry.orderId)).toBe(true);
    if (rn.ok) expect(await flag(rn.orderId)).toBe(false);
  });

  it("campanha para compradores: vai para quem marcou e para os pedidos de antes da caixa; não para quem não marcou", async () => {
    const { ev } = await event();
    const mk = async (email: string, producerOptIn: boolean | null) => D.db.insert(D.schema.orders).values({
      userId: qaId("u"), eventId: ev.id, status: "paid", totalCents: 5000, buyerEmail: email, buyerName: "Pessoa Teste", producerOptIn,
    });
    const legacy = `${qaId("antigo")}@example.com`, yes = `${qaId("sim")}@example.com`, no = `${qaId("nao")}@example.com`;
    await Promise.all([mk(legacy, null), mk(yes, true), mk(no, false)]);
    const list = await M.resolveAudience({ buyers: "events", buyerEvents: [ev.id], followers: false, signups: false, excludeBuyersOf: [] }, { orgId: null, userId: qaId("remetente") }, [ev.id]);
    const emails = list.map((r) => r.email).sort();
    expect(emails).toEqual([legacy, yes].sort());
  });
});
