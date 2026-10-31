"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import type { DbMap, Draft, VenuePlace } from "@/lib/criar/model";
import { saveEventAs, type SaveEventResult } from "@/lib/criar/save";
import { autocompletePlaces, placeDetails, placesEnabled } from "@/lib/places";
import { canCreateEvents, producerStatus } from "@/lib/producer-apply";

export type { SaveEventResult };

/** Salva o evento do formulário de /criar-evento em nome de quem está logado. */
export async function saveEvent(input: { draft: Draft; eventId: string | null; dbMap: DbMap }): Promise<SaveEventResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo para salvar o evento." };
  // evento novo só para produtor aprovado ou equipe (na produtora ativa; a portaria é barrada em saveEventAs; edição
  // continua presa a quem pode editar, dentro de saveEventAs)
  if (!input.eventId && !canCreateEvents((await producerStatus(user)).status)) return { ok: false, error: "Sua conta de produtor ainda não foi aprovada." };
  return saveEventAs(user, input);
}

export type VenueHit = { name: string; city: string; addr: string; cap: number | null; placeId?: string };

/** Buscas no Google por produtor por dia (as que não terminam num local escolhido são cobradas). */
const PLACES_DAILY = 300;
const tokenOk = (t: string) => /^[\w-]{16,64}$/.test(t);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Etapa "Onde vai ser?": locais já cadastrados na Tickets Win e, com a chave configurada, lugares reais do Google. */
export async function searchVenues(q: string, token = ""): Promise<VenueHit[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const term = q.trim().slice(0, 80);
  const { venues, cities } = schema;
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const google = term.length >= 3 && tokenOk(token) && placesEnabled() ? googleHits(user.id, term, token) : Promise.resolve([]);
  const rows = await db.select({ name: venues.name, neighborhood: venues.neighborhood, address: venues.address, cap: venues.capacity, city: cities.name, uf: cities.uf })
    .from(venues).innerJoin(cities, eq(cities.id, venues.cityId))
    .where(term ? or(ilike(venues.name, like), ilike(cities.name, like), ilike(venues.neighborhood, like)) : undefined)
    .orderBy(desc(venues.capacity)).limit(term.length >= 3 ? 3 : 6);
  const ours: VenueHit[] = rows.map((r) => ({ name: r.name, city: `${r.city} – ${r.uf}`, addr: r.address || r.neighborhood || "", cap: r.cap }));
  const known = new Set(ours.map((v) => norm(v.name)));
  return [...ours, ...(await google).filter((g) => !known.has(norm(g.name)))];
}

async function googleHits(userId: string, term: string, token: string): Promise<VenueHit[]> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const key = `places:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const used = Number((await env.KV.get(key)) ?? 0);
    if (used >= PLACES_DAILY) return [];
    await env.KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
    const hits = await autocompletePlaces(term, token);
    return hits.slice(0, 5).map((h) => ({ name: h.name, city: "", addr: h.addr, cap: null, placeId: h.placeId }));
  } catch (e) {
    console.error("places autocomplete", e);
    return [];
  }
}

/** Fecha a sessão de busca: endereço, cidade no formato "Cidade – UF" e coordenadas do lugar escolhido. */
export async function pickPlace(placeId: string, token: string): Promise<{ city: string; place: VenuePlace } | null> {
  const user = await getSessionUser();
  if (!user || !placesEnabled() || !tokenOk(token) || !/^[\w-]{10,300}$/.test(placeId)) return null;
  try {
    const p = await placeDetails(placeId, token);
    return p ? { city: `${p.city} – ${p.uf}`, place: p.place } : null;
  } catch (e) {
    console.error("places details", e);
    return null;
  }
}
