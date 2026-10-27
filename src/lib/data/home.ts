import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type HomeTier = { name: string; note: string | null; priceCents: number; status: "open" | "sold_out" | "upcoming" | "closed" };
export type HomeExtra = { description: string; tiers: HomeTier[] };

/** Descrição e lotes dos eventos da home (para a visualização rápida). */
export async function listHomeExtras(eventIds: string[]): Promise<Record<string, HomeExtra>> {
  const ids = Array.from(new Set(eventIds));
  if (!ids.length) return {};
  const rows = await db.query.events.findMany({
    where: inArray(schema.events.id, ids),
    columns: { id: true, description: true },
    with: { ticketTypes: { orderBy: [asc(schema.ticketTypes.sortOrder)] } },
  });
  const out: Record<string, HomeExtra> = {};
  for (const r of rows) {
    out[r.id] = {
      description: r.description ?? "",
      tiers: r.ticketTypes.map((t) => ({ name: t.name, note: t.note, priceCents: t.priceCents, status: t.status })),
    };
  }
  return out;
}
