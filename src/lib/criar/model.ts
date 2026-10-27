/* Formulário de criação de evento: tipos e regras usados no navegador e no servidor. */
import { slugify } from "@/lib/format";

export type EventMode = "unica" | "temporada" | "turne";
export type TicketMode = "mapa" | "simples";
export type TypeKind = "inteira" | "meia" | "social" | "outro";
export type Visibility = "publico" | "link" | "rascunho";
export type MediaKey = "poster" | "banner" | "home" | "strip" | "share";

export type DraftSession = { id: string; date: string; doors: string; time: string; cap: string; venue: string; city: string };
export type DraftType = { id: string; kind: TypeKind; name: string; price: string; qty: string; desc: string };
export type DraftSector = { id: string; name: string; color: string; open: boolean; types: DraftType[] };
export type DraftArtist = { id: string; name: string; role: string; time: string; end: string; days: string[] | null };
export type DraftCoupon = { id: string; code: string; kind: "pct" | "brl"; value: string; limit: string; until: string; scope: string };

export type Draft = {
  mode: EventMode;
  tmode: TicketMode;
  title: string;
  cat: string;
  catOther: string;
  age: string;
  desc: string;
  lineup: DraftArtist[];
  media: Partial<Record<MediaKey, string>>;
  coupons: DraftCoupon[];
  venue: { name: string; city: string };
  sessions: DraftSession[];
  autoMeia: boolean;
  fee: boolean;
  sectors: DraftSector[];
  map: "empty" | "sketch" | "done";
  prompt: string;
  sketchUrl: string;
  areaMap: Record<string, string>;
  vis: Visibility;
  saleStart: string;
  refund: string;
};

/** Ligação entre ids locais do formulário e linhas do banco (para editar depois de publicar). */
export type DbMap = { sessions: Record<string, string>; types: Record<string, string> };

export const CATEGORIES = ["Show", "Festa", "Festival", "Teatro", "Arte & Cultura", "Experiência", "Outros"] as const;
export const AGES = ["Livre", "14+", "16+", "18+"] as const;
export const ROLES = ["Headliner", "Convidado", "Abertura"] as const;
export const PALETTE = ["#7DA2FF", "#D3F55B", "#FF8AD8", "#FFB547", "#7DF9FF", "#C9B6FF"];
export const MEIA_DESC = "Estudantes, PcD, jovens de baixa renda e maiores de 60. Documento na entrada.";
export const DEFAULT_REFUND = "Até 7 dias após a compra, com 48h de antecedência";

/** Categoria da criação → filtros (kinds) e categorias da home. */
export const CATEGORY_KINDS: Record<string, string[]> = {
  Show: ["musica", "shows"],
  Festa: ["festas"],
  Festival: ["musica", "festivais"],
  Teatro: ["arte"],
  "Arte & Cultura": ["arte"],
  "Experiência": ["experiencias"],
  Outros: [],
};

export function emptyDraft(): Draft {
  return {
    mode: "unica", tmode: "simples", title: "", cat: "Show", catOther: "", age: "18+", desc: "",
    lineup: [], media: {}, coupons: [], venue: { name: "", city: "" }, sessions: [],
    autoMeia: true, fee: true,
    sectors: [{ id: "k1", name: "Ingressos", color: "#D3F55B", open: true, types: [{ id: "t1", kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "" }] }],
    map: "empty", prompt: "", sketchUrl: "", areaMap: {}, vis: "publico", saleStart: "", refund: DEFAULT_REFUND,
  };
}

/** "1.234,56" → 1234.56 */
export function num(v: string | number | null | undefined) {
  const n = Number.parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}
export const toCents = (v: string) => Math.round(num(v) * 100);

export type EffType = DraftType & { auto: boolean };

/** Tipos do setor como o comprador vê (com a meia-entrada automática), na ordem meia, social, inteira, outro. */
export function effTypes(k: DraftSector, autoMeia: boolean): EffType[] {
  const out: EffType[] = k.types.map((t) => ({ ...t, auto: false }));
  if (autoMeia && !k.types.some((u) => u.kind === "meia")) {
    for (const t of k.types) {
      if (t.kind !== "inteira") continue;
      out.push({
        id: `${t.id}-m`, kind: "meia", name: k.types.filter((u) => u.kind === "inteira").length > 1 ? `Meia · ${t.name}` : "Meia-entrada",
        price: String(Math.round((num(t.price) / 2) * 100) / 100).replace(".", ","), qty: String(Math.round(num(t.qty) * 0.4)),
        desc: MEIA_DESC, auto: true,
      });
    }
  }
  const ord: Record<TypeKind, number> = { meia: 0, social: 1, inteira: 2, outro: 3 };
  return out.sort((a, b) => ord[a.kind] - ord[b.kind]);
}

export function eventSlug(title: string) {
  return slugify(title).slice(0, 120).replace(/-$/, "") || "evento";
}

/** "São Paulo – SP" / "São Paulo - SP" / "São Paulo, SP" → { name, uf } */
export function parseCity(v: string): { name: string; uf: string } | null {
  const m = v.trim().match(/^(.+?)\s*[–—,/-]\s*([A-Za-z]{2})$/);
  if (!m) return null;
  return { name: m[1].trim(), uf: m[2].toUpperCase() };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-19" + "21:00" no fuso de Brasília (sem horário de verão desde 2019). */
export function spDate(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  const d = new Date(`${date}T${t}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "28/10/2026 às 10:00", "28/10/2026 10h", "28/10/2026" → Date (Brasília). Vazio → null. */
export function parseBrDateTime(v: string, endOfDay = false) {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2})(?:[:h](\d{2})?)?)?/i);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const time = h ? `${pad(+h)}:${mi ?? "00"}` : endOfDay ? "23:59" : "00:00";
  return spDate(`${y}-${pad(+mo)}-${pad(+d)}`, time);
}

export const KIND_LABEL: Record<TypeKind, string> = { inteira: "Inteira", meia: "Meia", social: "Social", outro: "Especial" };
