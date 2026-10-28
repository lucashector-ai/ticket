"use server";

import { desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import type { DbMap, Draft } from "@/lib/criar/model";
import { saveEventAs, type SaveEventResult } from "@/lib/criar/save";

export type { SaveEventResult };

/** Salva o evento do formulário de /criar-evento em nome de quem está logado. */
export async function saveEvent(input: { draft: Draft; eventId: string | null; dbMap: DbMap }): Promise<SaveEventResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo para salvar o evento." };
  return saveEventAs(user, input);
}

export type VenueHit = { name: string; city: string; addr: string; cap: number | null };

/** Locais já cadastrados na Tickets Win, para a etapa "Onde vai ser?". */
export async function searchVenues(q: string): Promise<VenueHit[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const term = q.trim().slice(0, 80);
  const { venues, cities } = schema;
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db.select({ name: venues.name, neighborhood: venues.neighborhood, address: venues.address, cap: venues.capacity, city: cities.name, uf: cities.uf })
    .from(venues).innerJoin(cities, eq(cities.id, venues.cityId))
    .where(term ? or(ilike(venues.name, like), ilike(cities.name, like), ilike(venues.neighborhood, like)) : undefined)
    .orderBy(desc(venues.capacity)).limit(6);
  return rows.map((r) => ({ name: r.name, city: `${r.city} – ${r.uf}`, addr: [r.neighborhood, r.address].filter(Boolean).join(" · "), cap: r.cap }));
}
