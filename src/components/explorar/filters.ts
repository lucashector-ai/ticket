/* Lógica de filtros do Explorar — pura (sem "use client"/"server-only"), usada pelo server (SSR) e pelo client (refiltro em memória).
   Reproduz ranges()/overlaps/matchesQuery/chipDefs do index.app.js do design. */
import type { EventCard } from "@/lib/data/events";
import { normalize, slugify } from "@/lib/format";

export type DateKey = "any" | "hoje" | "semana" | "fds" | "p30";
export type SortKey = "data" | "pop" | "preco";

export type Filters = {
  q: string;
  /** slug da cidade (ex.: "sao-paulo-sp") ou "all" */
  city: string;
  /** slug da categoria ou "all" */
  cat: string;
  date: DateKey;
  sort: SortKey;
  /** preço máximo em reais (null = qualquer) */
  max: number | null;
};

export const DEFAULT_FILTERS: Filters = { q: "", city: "all", cat: "all", date: "any", sort: "data", max: null };

export const DATE_OPTS: { value: DateKey; label: string }[] = [
  { value: "any", label: "Todas" },
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "fds", label: "Este fim de semana" },
  { value: "p30", label: "Próximos 30 dias" },
];
export const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: "data", label: "Data" },
  { value: "pop", label: "Popularidade" },
  { value: "preco", label: "Menor preço" },
];
export const PRICE_OPTS: { value: number | null; label: string }[] = [
  { value: null, label: "Todos" },
  { value: 40, label: "Até R$ 40" },
  { value: 60, label: "Até R$ 60" },
  { value: 100, label: "Até R$ 100" },
];

const DATE_KEYS: DateKey[] = ["any", "hoje", "semana", "fds", "p30"];
const SORT_KEYS: SortKey[] = ["data", "pop", "preco"];
const MAX_VALUES = [40, 60, 100];

type ParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function get(sp: ParamsLike, key: string): string {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? "";
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Lê `?q=&city=&cat=&date=&sort=&max=`. Valores inválidos caem no padrão. */
export function parseFilters(sp: ParamsLike): Filters {
  const date = get(sp, "date") as DateKey;
  const sort = get(sp, "sort") as SortKey;
  const max = Number(get(sp, "max"));
  return {
    q: get(sp, "q").slice(0, 80),
    city: get(sp, "city") || "all",
    cat: get(sp, "cat") || "all",
    date: DATE_KEYS.includes(date) ? date : "any",
    sort: SORT_KEYS.includes(sort) ? sort : "data",
    max: MAX_VALUES.includes(max) ? max : null,
  };
}

/** Só os parâmetros que diferem do padrão, para a URL ficar limpa e compartilhável. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.city !== "all") p.set("city", f.city);
  if (f.cat !== "all") p.set("cat", f.cat);
  if (f.date !== "any") p.set("date", f.date);
  if (f.sort !== "data") p.set("sort", f.sort);
  if (f.max != null) p.set("max", String(f.max));
  return p;
}

export function sameFilters(a: Filters, b: Filters) {
  return a.q === b.q && a.city === b.city && a.cat === b.cat && a.date === b.date && a.sort === b.sort && a.max === b.max;
}

export function isDefault(f: Filters) {
  return sameFilters(f, DEFAULT_FILTERS);
}

/* ---------- regras (index.app.js) ---------- */

export type Range = [number, number];

export function ranges(now = new Date()): Record<Exclude<DateKey, "any">, Range> & { now: number; t0: number } {
  const DAY = 86_400_000;
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  const t0 = t.getTime(), dow = t.getDay();
  const sunEnd = t0 + ((7 - dow) % 7) * DAY + DAY - 1;
  const fds = dow === 5 || dow === 6 || dow === 0 ? t0 : t0 + (5 - dow) * DAY;
  return { now: now.getTime(), t0, hoje: [t0, t0 + DAY - 1], semana: [t0, sunEnd], fds: [fds, sunEnd], p30: [t0, t0 + 30 * DAY] };
}

export function overlaps(e: Pick<EventCard, "startAt" | "endAt">, r: Range) {
  const s = e.startAt.getTime(), en = (e.endAt ?? e.startAt).getTime();
  return s <= r[1] && en >= r[0];
}

/** Distância de edição até 1 (uma letra trocada, a mais ou a menos), sem calcular a matriz toda. */
function near(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Busca: cada palavra precisa aparecer no nome, local, cidade, line-up, categoria ou chamada do evento.
 * Palavras de 4+ letras aceitam um erro de digitação ("aurra" acha "Aurora").
 */
export function matchesQuery(e: EventCard, q: string) {
  if (!q.trim()) return true;
  const hay = normalize([e.title, e.venue, e.city, e.uf, e.lineup.join(" "), e.categoryLabel ?? "", e.kinds.join(" "), e.tagline ?? ""].join(" "));
  const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
  return normalize(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || (w.length >= 4 && tokens.some((t) => near(w, t) || near(w, t.slice(0, w.length)))));
}

/** Slug da cidade do evento, igual ao do seed (`slugify("São Paulo-SP")`). */
export function cityKey(e: Pick<EventCard, "city" | "uf">) {
  return slugify(`${e.city}-${e.uf}`);
}

export function cityMatches(e: Pick<EventCard, "city" | "uf">, value: string) {
  return value === "all" || !value || e.city === value || cityKey(e) === value;
}

/** Filtra + ordena em memória. */
export function applyFilters(events: EventCard[], f: Filters, now = new Date()): EventCard[] {
  const R = ranges(now);
  const list = events.filter((e) => {
    if (!cityMatches(e, f.city)) return false;
    if (f.cat !== "all" && !e.kinds.includes(f.cat)) return false;
    if (f.date !== "any" && !overlaps(e, R[f.date])) return false;
    if (f.max != null && e.minPriceCents > f.max * 100) return false;
    return matchesQuery(e, f.q);
  });
  return list.sort((a, b) => {
    if (f.sort === "pop") return b.popularity - a.popularity;
    if (f.sort === "preco") return a.minPriceCents - b.minPriceCents;
    return a.startAt.getTime() - b.startAt.getTime();
  });
}

/* ---------- chips: atalhos para os mesmos filtros ---------- */

export type ChipDef = { id: string; label: string; on: boolean; patch: Partial<Filters> };

export function chipDefs(s: Filters): ChipDef[] {
  // data, preço e ordem ficam nos seletores; aqui só as categorias (uma linha só)
  const catChip = (id: string, label: string): ChipDef => ({ id, label, on: s.cat === id, patch: { cat: s.cat === id ? "all" : id } });
  return [
    { id: "todos", label: "Todos", on: s.cat === "all", patch: { cat: "all" } },
    catChip("festas", "Festas"),
    catChip("shows", "Shows"),
    catChip("festivais", "Festivais"),
    catChip("eletronica", "Eletrônica"),
    catChip("hiphop", "Hip-hop & Rap"),
    catChip("arte", "Arte & Cultura"),
    catChip("experiencias", "Experiências"),
  ];
}

export const PAGE_SIZE = 12;

/** Categorias da grade "Explore por categoria" (as 7 do design; o select mostra todas). */
export const MAIN_CATS = ["shows", "festas", "festivais", "eletronica", "hiphop", "arte", "experiencias"];
