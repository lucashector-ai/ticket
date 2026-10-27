"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { resaleCap } from "@/lib/resale";

const { tickets, resaleListings, ticketTransfers } = schema;
type R = { ok: true } | { ok: false; error: string };

/** Anuncia o ingresso na revenda oficial, até o preço máximo do evento. */
export async function createListing(ticketId: string, priceCents: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const t = await db.query.tickets.findFirst({
    where: and(eq(tickets.id, ticketId), eq(tickets.holderUserId, user.id)),
    with: { event: { columns: { id: true, slug: true, status: true, startAt: true, endAt: true, resaleEnabled: true, resaleMaxPct: true } }, ticketType: { columns: { priceCents: true } } },
  });
  if (!t) return { ok: false, error: "Ingresso não encontrado." };
  if (t.status !== "valid") return { ok: false, error: "Só ingressos válidos podem ir para a revenda." };
  if (!t.event.resaleEnabled || t.event.status !== "published") return { ok: false, error: "O produtor não liberou revenda para este evento." };
  if ((t.event.endAt ?? t.event.startAt) < new Date()) return { ok: false, error: "O evento já aconteceu." };
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
