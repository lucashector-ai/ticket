import { normalize } from "@/lib/format";
import type { DateFilter, HomeEvent } from "./types";

const DAY = 86_400_000;

/** Janelas de data (no fuso do navegador), como no app original. */
export function ranges(now = new Date()): Record<Exclude<DateFilter, "any">, [number, number]> {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  const t0 = t.getTime(), dow = t.getDay();
  const sunEnd = t0 + ((7 - dow) % 7) * DAY + DAY - 1;
  const fds = dow === 5 || dow === 6 || dow === 0 ? t0 : t0 + (5 - dow) * DAY;
  return { hoje: [t0, t0 + DAY - 1], semana: [t0, sunEnd], fds: [fds, sunEnd], p30: [t0, t0 + 30 * DAY] };
}

export function overlaps(e: HomeEvent, r: [number, number]) {
  return e.startMs <= r[1] && e.endMs >= r[0];
}

export function matchesQuery(e: HomeEvent, q: string) {
  if (!q) return true;
  const hay = normalize([e.title, e.venue, e.city, e.uf, e.lineup.join(" ")].join(" "));
  return normalize(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export type Filters = { query: string; city: string; date: DateFilter; cat: string; sort: "data" | "pop" | "preco"; onlyFavs: boolean };

export const DEFAULT_FILTERS: Filters = { query: "", city: "all", date: "any", cat: "all", sort: "data", onlyFavs: false };

export function applyFilters(live: HomeEvent[], f: Filters, favs: string[]) {
  const R = ranges();
  const list = live.filter((e) => {
    if (f.onlyFavs && !favs.includes(e.slug)) return false;
    if (f.city !== "all" && e.city !== f.city) return false;
    if (f.cat !== "all" && !e.kinds.includes(f.cat)) return false;
    if (f.date !== "any" && !overlaps(e, R[f.date])) return false;
    return matchesQuery(e, f.query);
  });
  return list.sort((a, b) => {
    if (f.sort === "pop") return b.popularity - a.popularity;
    if (f.sort === "preco") return a.minPriceCents - b.minPriceCents;
    return a.startMs - b.startMs;
  });
}

/** Query string para /explorar com os filtros ativos. */
export function exploreHref(f: Filters) {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.city !== "all") p.set("city", f.city);
  if (f.cat !== "all") p.set("cat", f.cat);
  if (f.date !== "any") p.set("date", f.date);
  if (f.sort !== "data") p.set("sort", f.sort);
  if (f.onlyFavs) p.set("salvos", "1");
  const s = p.toString();
  return s ? `/explorar?${s}` : "/explorar";
}
