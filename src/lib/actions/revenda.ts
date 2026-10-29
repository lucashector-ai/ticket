"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { RESALE_MAX_PCT, resaleCap } from "@/lib/resale";
import { getPainelScope } from "@/lib/data/painel";
import { DEADLINE_HOURS, deadlineLabel, deadlineOpen } from "@/lib/refund-policy";

const { tickets, resaleListings, ticketTransfers } = schema;
type R = { ok: true } | { ok: false; error: string };

/** Anuncia o ingresso na revenda oficial, até o preço máximo do evento. */
export async function createListing(ticketId: string, priceCents: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const t = await db.query.tickets.findFirst({
    where: and(eq(tickets.id, ticketId), eq(tickets.holderUserId, user.id)),
    with: { event: { columns: { id: true, slug: true, status: true, startAt: true, endAt: true, resaleEnabled: true, resaleMaxPct: true, resaleUntilHours: true } }, ticketType: { columns: { priceCents: true } } },
  });
  if (!t) return { ok: false, error: "Ingresso não encontrado." };
  if (t.status !== "valid") return { ok: false, error: "Só ingressos válidos podem ir para a revenda." };
  if (!t.event.resaleEnabled || t.event.status !== "published") return { ok: false, error: "O produtor não liberou revenda para este evento." };
  if ((t.event.endAt ?? t.event.startAt) < new Date()) return { ok: false, error: "O evento já aconteceu." };
  if (!deadlineOpen(t.event.startAt, t.event.resaleUntilHours)) return { ok: false, error: `O prazo da revenda deste evento acabou (${deadlineLabel(t.event.resaleUntilHours)}).` };
  if (!t.ticketType.priceCents) return { ok: false, error: "Ingresso grátis não vai para a revenda. Se não puder ir, transfira para alguém." };
  const { maxCents } = resaleCap(t.ticketType.priceCents, t.halfPrice, t.event.resaleMaxPct);
  const price = Math.round(priceCents);
  if (!Number.isFinite(price) || price < 500) return { ok: false, error: "O preço mínimo na revenda é R$ 5." };
  if (price > maxCents) return { ok: false, error: `O preço máximo para este ingresso é ${(maxCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` };
  const open = await db.query.resaleListings.findFirst({ where: and(eq(resaleListings.ticketId, t.id), inArray(resaleListings.status, ["active", "reserved"])), columns: { id: true } });
  if (open) return { ok: false, error: "Este ingresso já está na revenda." };
  const pending = await db.query.ticketTransfers.findFirst({ where: and(eq(ticketTransfers.ticketId, t.id), eq(ticketTransfers.status, "pending")), columns: { id: true } });
  if (pending) return { ok: false, error: "Este ingresso tem uma transferência em andamento." };
  const [row] = await db.insert(resaleListings).values({ ticketId: t.id, eventId: t.event.id, ticketTypeId: t.ticketTypeId, sellerUserId: user.id, priceCents: price }).returning({ id: resaleListings.id });
  revalidatePath(`/ingressos/${t.code}`);
  revalidatePath(`/eventos/${t.event.slug}`);
  return { ok: true, id: row.id };
}

/** Tira o ingresso da revenda (se ninguém estiver pagando por ele agora). */
export async function cancelListing(listingId: string): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const l = await db.query.resaleListings.findFirst({ where: and(eq(resaleListings.id, listingId), eq(resaleListings.sellerUserId, user.id)) });
  if (!l || l.status === "sold" || l.status === "cancelled") return { ok: false, error: "Anúncio não encontrado." };
  if (l.status === "reserved" && l.reservedUntil && l.reservedUntil > new Date()) return { ok: false, error: "Alguém está pagando por este ingresso agora. Tente de novo em alguns minutos." };
  await db.update(resaleListings).set({ status: "cancelled" }).where(eq(resaleListings.id, l.id));
  revalidatePath("/meus-ingressos");
  return { ok: true };
}

/* ---------- produtor: regras de transferência e revenda do evento ---------- */

async function producerEvent(eventId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  if (s.role === "portaria") return null;
  return s.events.find((e) => e.id === eventId) ?? null;
}

export async function saveTransferResale(eventId: string, input: { transferEnabled: boolean; resaleEnabled: boolean; resaleMaxPct: number; transferUntilHours?: number; resaleUntilHours?: number }): Promise<R> {
  const ev = await producerEvent(eventId);
  if (!ev) return { ok: false, error: "Sem permissão para este evento." };
  const pct = Math.round(input.resaleMaxPct);
  if (!Number.isFinite(pct) || pct < 50 || pct > RESALE_MAX_PCT) return { ok: false, error: "O preço máximo vai de 50% a 100% do valor pago (ninguém revende acima do que pagou)." };
  // prazos: transferir / revender até X horas antes do início (0 = até o início)
  const okH = (h: unknown) => (DEADLINE_HOURS as readonly number[]).includes(Number(h));
  if ((input.transferUntilHours !== undefined && !okH(input.transferUntilHours)) || (input.resaleUntilHours !== undefined && !okH(input.resaleUntilHours))) return { ok: false, error: "Escolha um dos prazos da lista." };
  await db.update(schema.events).set({
    transferEnabled: !!input.transferEnabled, resaleEnabled: !!input.resaleEnabled, resaleMaxPct: pct,
    ...(input.transferUntilHours !== undefined ? { transferUntilHours: Number(input.transferUntilHours) } : {}),
    ...(input.resaleUntilHours !== undefined ? { resaleUntilHours: Number(input.resaleUntilHours) } : {}),
  }).where(eq(schema.events.id, ev.id));
  // revenda desligada: os anúncios abertos saem do ar (quem estiver pagando agora termina a compra)
  if (!input.resaleEnabled) await db.update(resaleListings).set({ status: "cancelled" }).where(and(eq(resaleListings.eventId, ev.id), eq(resaleListings.status, "active")));
  revalidatePath(`/painel/evento/${ev.id}`);
  revalidatePath(`/eventos/${ev.slug}`);
  return { ok: true };
}

/** O produtor tira um anúncio do ar (preço abusivo, denúncia, ingresso com problema). */
export async function producerCancelListing(listingId: string): Promise<R> {
  const l = await db.query.resaleListings.findFirst({ where: eq(resaleListings.id, listingId), columns: { id: true, eventId: true, status: true } });
  if (!l || !(await producerEvent(l.eventId))) return { ok: false, error: "Anúncio não encontrado." };
  if (l.status !== "active") return { ok: false, error: l.status === "reserved" ? "Alguém está pagando por este ingresso agora." : "Este anúncio não está mais ativo." };
  await db.update(resaleListings).set({ status: "cancelled" }).where(eq(resaleListings.id, l.id));
  revalidatePath(`/painel/evento/${l.eventId}`);
  return { ok: true };
}
