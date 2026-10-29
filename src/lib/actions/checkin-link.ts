"use server";

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeCheckinLink, checkinCounts, checkinTicket } from "@/lib/checkin";

export type LinkScan = {
  ok: boolean; error?: string; off?: boolean;
  ticket?: { code: string; holderName: string | null; ticketType: string; sector: string | null };
  checkedInAt?: string | null;
  inside?: number; total?: number;
};

/** Leitura feita pela tela de check-in aberta pelo link externo (sem conta no painel). */
export async function scanWithLink(token: string, input: string): Promise<LinkScan> {
  const link = await activeCheckinLink(token);
  if (!link) return { ok: false, off: true, error: "Este link de check-in foi desligado pelo produtor." };
  const r = await checkinTicket(String(input).slice(0, 200), new Set([link.eventId]), `Link · ${link.label}`);
  await db.update(schema.checkinLinks)
    .set({ lastUsedAt: new Date(), ...(r.ok ? { scans: sql`${schema.checkinLinks.scans} + 1` } : {}) })
    .where(eq(schema.checkinLinks.id, link.id));
  const c = await checkinCounts(link.eventId);
  const t = r.ticket;
  return {
    ok: r.ok, error: r.error, inside: c.inside, total: c.total,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    ticket: t ? { code: t.code, holderName: t.holderName, ticketType: t.ticketType, sector: t.sector } : undefined,
  };
}

/** Contagem atualizada (a tela consulta de tempos em tempos: outras portarias também marcam entradas). */
export async function linkCounts(token: string): Promise<{ ok: true; inside: number; total: number } | { ok: false }> {
  const link = await activeCheckinLink(token);
  if (!link) return { ok: false };
  return { ok: true, ...(await checkinCounts(link.eventId)) };
}
