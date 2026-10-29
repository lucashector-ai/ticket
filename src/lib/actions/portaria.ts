"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkinCounts, checkinTicket } from "@/lib/checkin";
import { checkinGuest, doorGuests, guestKind, guestCounts, type DoorGuest } from "@/lib/guest-list";
import { activeAccess, clearPortariaCookie, normalizeCode, portariaSession, setPortariaCookie } from "@/lib/portaria";

export type PortariaScan = {
  ok: boolean; error?: string; off?: boolean;
  ticket?: { code: string; holderName: string | null; ticketType: string; sector: string | null };
  checkedInAt?: string | null;
  inside?: number; total?: number;
};
export type Guest = { id: string; code: string; name: string; type: string; sector: string | null; inAt: string | null };

/** tentativas de código por IP a cada 15 min (o código tem ~40 bits; isso impede chutar) */
const MAX_TRIES = 8;

/** Entra num evento com o código de acesso da portaria. */
export async function enterWithCode(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = normalizeCode(raw);
  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { env } = await getCloudflareContext({ async: true });
  const key = `portaria-try:${ip}`;
  const tries = Number((await env.KV.get(key)) ?? 0);
  if (tries >= MAX_TRIES) return { ok: false, error: "Muitas tentativas. Espere 15 minutos e tente de novo." };
  const link = code ? await activeAccess({ code }) : null;
  if (!link) {
    await env.KV.put(key, String(tries + 1), { expirationTtl: 15 * 60 });
    return { ok: false, error: "Código inválido, desligado ou de um evento que já acabou." };
  }
  await setPortariaCookie(link.id);
  return { ok: true };
}

export async function leavePortaria() {
  await clearPortariaCookie();
}

/** Leitura do QR (ou código digitado) no app da portaria. */
export async function portariaScan(input: string): Promise<PortariaScan> {
  const link = await portariaSession();
  if (!link) return { ok: false, off: true, error: "Este acesso foi desligado pelo produtor." };
  const r = await checkinTicket(String(input).slice(0, 200), new Set([link.eventId]), `Portaria · ${link.label}`);
  return finish(link, r);
}

/** Liberação manual pela lista (pessoa sem o celular, QR que não lê...). */
export async function portariaRelease(ticketId: string): Promise<PortariaScan> {
  const link = await portariaSession();
  if (!link) return { ok: false, off: true, error: "Este acesso foi desligado pelo produtor." };
  if (!/^[0-9a-f-]{36}$/.test(ticketId)) return { ok: false, error: "Ingresso não encontrado." };
  const t = await db.query.tickets.findFirst({ where: and(eq(schema.tickets.id, ticketId), eq(schema.tickets.eventId, link.eventId)), columns: { code: true } });
  if (!t) return { ok: false, error: "Ingresso não encontrado." };
  return finish(link, await checkinTicket(t.code, new Set([link.eventId])));
}

async function finish(link: NonNullable<Awaited<ReturnType<typeof portariaSession>>>, r: Awaited<ReturnType<typeof checkinTicket>>): Promise<PortariaScan> {
  await db.update(schema.checkinLinks)
    .set({ lastUsedAt: new Date(), ...(r.ok ? { scans: sql`${schema.checkinLinks.scans} + 1` } : {}) })
    .where(eq(schema.checkinLinks.id, link.id));
  const c = await checkinCounts(link.eventId);
  const t = r.ticket;
  return {
    ok: r.ok, error: r.error, inside: c.inside, total: c.total, checkedInAt: r.checkedInAt?.toISOString() ?? null,
    ticket: t ? { code: t.code, holderName: t.holderName, ticketType: t.ticketType, sector: t.sector } : undefined,
  };
}

/** Lista de quem tem ingresso (nome, tipo e se já entrou), para busca e liberação manual. */
export async function portariaGuests(): Promise<{ ok: true; guests: Guest[]; inside: number; total: number } | { ok: false }> {
  const link = await portariaSession();
  if (!link) return { ok: false };
  const t = schema.tickets, tt = schema.ticketTypes;
  const rows = await db.select({ id: t.id, code: t.code, name: t.holderName, type: tt.name, sector: tt.sector, inAt: t.checkedInAt })
    .from(t).innerJoin(tt, eq(tt.id, t.ticketTypeId))
    .where(and(eq(t.eventId, link.eventId), inArray(t.status, ["valid", "used"])))
    .orderBy(asc(t.holderName)).limit(5000);
  const guests = rows.map((r) => ({ id: r.id, code: r.code, name: r.name?.trim() || "Sem nome", type: r.type, sector: r.sector, inAt: r.inAt?.toISOString() ?? null }));
  return { ok: true, guests, inside: guests.filter((g) => g.inAt).length, total: guests.length };
}

/** Contagem (o app consulta de tempos em tempos: outras portarias também liberam). */
export async function portariaCounts(): Promise<{ ok: true; inside: number; total: number } | { ok: false }> {
  const link = await portariaSession();
  if (!link) return { ok: false };
  return { ok: true, ...(await checkinCounts(link.eventId)) };
}

/* ---------- lista free (convidados não pagantes) ---------- */

export type FreeList = { ok: true; guests: DoorGuest[]; names: number; people: number; namesIn: number; peopleIn: number } | { ok: false };

/** Lista free do evento (nome, acompanhantes, observação e se já entrou; sem e-mail). */
export async function portariaFreeList(): Promise<FreeList> {
  const link = await portariaSession();
  if (!link) return { ok: false };
  const [guests, c] = await Promise.all([doorGuests(link.eventId), guestCounts(link.eventId)]);
  return { ok: true, guests, ...c };
}

/** Libera a entrada de um nome da lista free (uma vez só; os acompanhantes entram junto). */
export async function portariaReleaseFree(id: string): Promise<PortariaScan> {
  const link = await portariaSession();
  if (!link) return { ok: false, off: true, error: "Este acesso foi desligado pelo produtor." };
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Nome não encontrado na lista." };
  const r = await checkinGuest({ id }, new Set([link.eventId]), `Portaria · ${link.label}`);
  return finish(link, {
    ok: r.ok, status: r.ok ? 200 : 409, error: r.error, checkedInAt: r.checkedInAt,
    ticket: r.guest ? { code: "LISTA FREE", holderName: r.guest.name, event: r.guest.event, ticketType: guestKind(r.guest.guests), sector: null } : undefined,
  });
}
