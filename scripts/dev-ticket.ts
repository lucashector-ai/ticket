/* Dados de teste para /meus-ingressos: pedidos pagos + ingressos para um usuário.
   Rode com: pnpm tsx --env-file=.env.local scripts/dev-ticket.ts <userId> [nome do titular]
   (o usuário vem do Neon Auth: cadastre via POST /api/auth/sign-up/email e use o id retornado) */
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");
const db = drizzle(neon(url), { schema });

const [userId, holderArg] = process.argv.slice(2);
if (!userId) { console.error("uso: tsx --env-file=.env.local scripts/dev-ticket.ts <userId> [nome]"); process.exit(1); }
const holder = holderArg ?? "Lucas Hector";

function ticketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `ONDE-${s.slice(0, 4)}-${s.slice(4)}`;
}
const sp = (iso: string) => new Date(iso + ":00-03:00");

/** Pedido pago + N ingressos para um lote. */
async function buy(eventSlug: string, tierName: string, qty: number, opts: { used?: boolean; holders?: string[] } = {}) {
  const ev = await db.query.events.findFirst({ where: eq(schema.events.slug, eventSlug), with: { ticketTypes: true } });
  if (!ev) throw new Error(`evento ${eventSlug} não encontrado`);
  const tt = ev.ticketTypes.find((t) => t.name === tierName) ?? ev.ticketTypes[0];
  if (!tt) throw new Error(`lote ${tierName} não encontrado em ${eventSlug}`);
  const subtotal = tt.priceCents * qty, fees = tt.feeCents * qty;
  const [order] = await db.insert(schema.orders).values({
    userId, eventId: ev.id, status: "paid", subtotalCents: subtotal, feeCents: fees, discountCents: 0, totalCents: subtotal + fees,
    paymentMethod: "test", buyerName: holder, paidAt: new Date(),
  }).returning();
  await db.update(schema.orders).set({ paymentRef: `TEST-${order.number}` }).where(eq(schema.orders.id, order.id));
  const [item] = await db.insert(schema.orderItems).values({ orderId: order.id, ticketTypeId: tt.id, quantity: qty, unitPriceCents: tt.priceCents, unitFeeCents: tt.feeCents }).returning();
  const holders = opts.holders ?? [holder];
  const rows = Array.from({ length: qty }, (_, i) => ({
    code: ticketCode(), orderId: order.id, orderItemId: item.id, eventId: ev.id, ticketTypeId: tt.id, holderUserId: userId,
    holderName: holders[i % holders.length], secret: randomBytes(16).toString("hex"),
    status: (opts.used ? "used" : "valid") as "used" | "valid", checkedInAt: opts.used ? ev.startAt : null,
  }));
  const inserted = await db.insert(schema.tickets).values(rows).returning({ code: schema.tickets.code });
  console.log(`pedido #${order.number} · ${ev.title} · ${tt.name} · ${qty}x → ${inserted.map((t) => t.code).join(", ")}`);
}

/** Evento já encerrado (status finished, fora das listagens) para a aba "Passados". */
async function pastEvent(baseSlug: string, slug: string, start: string, end: string) {
  const exists = await db.query.events.findFirst({ where: eq(schema.events.slug, slug) });
  if (exists) return slug;
  const base = await db.query.events.findFirst({ where: eq(schema.events.slug, baseSlug) });
  if (!base) throw new Error(`evento base ${baseSlug} não encontrado`);
  const [ev] = await db.insert(schema.events).values({
    slug, title: base.title, tagline: base.tagline, description: base.description, status: "finished",
    flyerId: base.flyerId, bannerId: base.bannerId, accentColor: base.accentColor,
    startAt: sp(start), endAt: sp(end), dateLabel: null, dateFullLabel: null, timed: true, doorsLabel: base.doorsLabel, ageRating: base.ageRating,
    venueId: base.venueId, addressLabel: base.addressLabel, organizerId: base.organizerId, primaryCategoryLabel: base.primaryCategoryLabel,
    kinds: base.kinds, popularity: base.popularity, minPriceCents: base.minPriceCents, featured: false,
  }).returning();
  await db.insert(schema.ticketTypes).values({ eventId: ev.id, name: "Pista — 1º lote", note: "Encerrado", priceCents: base.minPriceCents, feeCents: Math.round(base.minPriceCents * 0.1), quantity: 500, sold: 500, status: "closed", sortOrder: 0 });
  return slug;
}

async function main() {
  const existing = await db.query.orders.findFirst({ where: and(eq(schema.orders.userId, userId), eq(schema.orders.status, "paid")) });
  if (existing) { console.log("usuário já tem pedidos pagos; nada a fazer (apague os pedidos para recriar)."); return; }

  // Próximos (como no design)
  await buy("baile", "Pista — 2º lote", 2, { holders: [holder, "Marina Souza"] });
  await buy("sintonia", "Pista premium — lote único", 3, { holders: [holder, "Marina Souza", "Pedro Lima"] });
  await buy("marea", "Passaporte — lote único", 1);
  await buy("terreiro", "Pista — 1º lote", 2, { holders: [holder, "Marina Souza"] });

  // Passados (eventos encerrados, ingressos utilizados)
  const p1 = await pastEvent("calourada", "calourada-set-2026", "2026-09-12T22:00", "2026-09-13T05:00");
  const p2 = await pastEvent("guitarra", "guitarra-ago-2026", "2026-08-23T21:00", "2026-08-24T02:00");
  await buy(p1, "Pista — 1º lote", 2, { used: true, holders: [holder, "Marina Souza"] });
  await buy(p2, "Pista — 1º lote", 1, { used: true });
  console.log("pronto.");
}

main().catch((err) => { console.error(err); process.exit(1); });
