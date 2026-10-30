/* Formulário de criação de evento: tipos e regras usados no navegador e no servidor. */
import { slugify } from "@/lib/format";
import type { VenuePlan } from "./plan";

export type EventMode = "unica" | "temporada" | "turne";
export type TicketMode = "mapa" | "simples";
export type TypeKind = "inteira" | "meia" | "social" | "outro";
export type Visibility = "publico" | "link" | "rascunho";
export type MediaKey = "poster" | "banner" | "home" | "strip" | "share";

/** Lugar real escolhido na busca do Google: endereço, bairro e coordenadas. */
export type VenuePlace = { id: string; addr: string; hood: string | null; lat: number; lng: number };
/** `end`: horário de término (vazio = 6 h depois do início; antes do início = passa da meia-noite). */
export type DraftSession = { id: string; date: string; doors: string; time: string; end?: string; cap: string; venue: string; city: string; place?: VenuePlace };
/** `free`: ingresso gratuito (sem preço nem taxa); `limit`: máximo que cada pessoa pode levar desse tipo. */
export type DraftType = { id: string; kind: TypeKind; name: string; price: string; qty: string; desc: string; free?: boolean; limit?: string };
export type DraftSector = { id: string; name: string; color: string; open: boolean; types: DraftType[] };
/** `spotifyId`/`image`: artista escolhido na busca do Spotify. */
export type DraftArtist = { id: string; name: string; role: string; time: string; end: string; days: string[] | null; spotifyId?: string; image?: string | null };
export type DraftCoupon = { id: string; code: string; kind: "pct" | "brl"; value: string; limit: string; until: string; scope: string };

/**
 * Tela de contagem antes da abertura das vendas (ocupa a página inteira do evento).
 * theme: escuro (preto da marca) · lima · arte (banner do evento) · foto (imagem enviada).
 */
export type Teaser = { theme: "escuro" | "lima" | "arte" | "foto"; image?: string; headline: string; message: string; lineup: boolean };
export const DEFAULT_TEASER: Teaser = { theme: "arte", headline: "", message: "", lineup: true };

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
  venue: { name: string; city: string; place?: VenuePlace };
  sessions: DraftSession[];
  autoMeia: boolean;
  fee: boolean;
  /** o fã pode transferir o ingresso / revender na revenda oficial */
  transfer: boolean;
  resale: boolean;
  sectors: DraftSector[];
  map: "empty" | "sketch" | "done";
  prompt: string;
  sketchUrl: string;
  /** planta do local (gerada pela IA ou pelo modelo e ajustada no editor) */
  plan: VenuePlan | null;
  vis: Visibility;
  saleStart: string;
  /** pré-venda para cadastrados (link secreto por e-mail), antes de saleStart */
  presaleStart: string;
  /** menores podem entrar acompanhados dos pais ou responsáveis */
  minors: boolean;
  teaser: Teaser;
  refund: string;
};

/** Ligação entre ids locais do formulário e linhas do banco (para editar depois de publicar). */
export type DbMap = { sessions: Record<string, string>; types: Record<string, string> };

export const CATEGORIES = ["Show", "Festa", "Festival", "Teatro", "Arte & Cultura", "Experiência", "Outros"] as const;
export const AGES = ["Livre", "12+", "14+", "16+", "18+"] as const;
/** Cartões da primeira etapa: o tipo vira a categoria do evento. */
export const EVENT_TYPES: { cat: string; sub: string; icon: string }[] = [
  { cat: "Festa", sub: "Balada, baile, pista", icon: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" },
  { cat: "Show", sub: "Artista no palco", icon: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" },
  { cat: "Festival", sub: "Vários palcos e dias", icon: "M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6" },
  { cat: "Teatro", sub: "Peças e espetáculos", icon: "M4 4h16v6a8 8 0 0 1-16 0zM9 9h.01M15 9h.01M9 13c1.5 1.5 4.5 1.5 6 0" },
  { cat: "Curso", sub: "Workshop e palestra", icon: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5" },
  { cat: "Esporte", sub: "Corrida, jogo, luta", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" },
  { cat: "Gastronomia", sub: "Jantar e degustação", icon: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" },
  { cat: "Outros", sub: "Algo diferente", icon: "M12 5v14M5 12h14" },
];
export const ROLES = ["Headliner", "Convidado", "Abertura"] as const;
export const PALETTE = ["#7DA2FF", "#D3F55B", "#FF8AD8", "#FFB547", "#7DF9FF", "#C9B6FF"];
export const MEIA_DESC = "Estudantes, PcD, jovens de baixa renda e maiores de 60. Documento na entrada.";
/** Texto que vinha pronto no antigo campo "Política de cancelamento". Hoje o campo é "Observações (opcional)"
 *  e começa vazio (DM-3); quem ainda tem este texto salvo é tratado como sem observação. */
export const DEFAULT_REFUND = "Até 7 dias após a compra, com 48h de antecedência";
export const isDefaultRefund = (s: string | null | undefined) => (s ?? "").trim().replace(/\.$/, "") === DEFAULT_REFUND;
export const MAX_LIMIT = 20;
/** Limite por pessoa do tipo (rascunhos antigos não tinham o campo: 2 no personalizado, 6 nos outros). */
export function limitOf(t: Pick<DraftType, "kind" | "limit">) {
  const n = Math.round(num(t.limit));
  return n > 0 ? Math.min(n, MAX_LIMIT) : t.kind === "outro" ? 2 : 6;
}

/** Categoria da criação → filtros (kinds) e categorias da home. */
export const CATEGORY_KINDS: Record<string, string[]> = {
  Show: ["musica", "shows"],
  Festa: ["festas"],
  Festival: ["musica", "festivais"],
  Teatro: ["arte"],
  "Arte & Cultura": ["arte"],
  "Experiência": ["experiencias"],
  Curso: ["experiencias"],
  Esporte: ["experiencias"],
  Gastronomia: ["experiencias"],
  Outros: [],
};

export function emptyDraft(): Draft {
  return {
    mode: "unica", tmode: "simples", title: "", cat: "", catOther: "", age: "18+", desc: "",
    lineup: [], media: {}, coupons: [], venue: { name: "", city: "" }, sessions: [],
    autoMeia: true, fee: true, transfer: true, resale: true,
    sectors: [{ id: "k1", name: "Ingressos", color: "#D3F55B", open: true, types: [{ id: "t1", kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }] }],
    map: "empty", prompt: "", sketchUrl: "", plan: null, vis: "publico", saleStart: "", presaleStart: "", minors: false, teaser: { ...DEFAULT_TEASER }, refund: "",
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
      // ingresso grátis não tem meia
      if (t.kind !== "inteira" || t.free) continue;
      out.push({
        id: `${t.id}-m`, kind: "meia", name: k.types.filter((u) => u.kind === "inteira").length > 1 ? `Meia · ${t.name}` : "Meia-entrada",
        price: String(Math.round((num(t.price) / 2) * 100) / 100).replace(".", ","), qty: String(Math.round(num(t.qty) * 0.4)),
        desc: MEIA_DESC, limit: t.limit, auto: true,
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

/** Date → "28/10/2026 às 10:00" no horário de Brasília (o formato do campo Início das vendas). */
export function brDateTime(d: Date) {
  const o: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[x.type] = x.value;
  return `${o.day}/${o.month}/${o.year} às ${o.hour}:${o.minute}`;
}

/** "31/10/2026 às 20:00" ↔ { date: "2026-10-31", time: "20:00" } (campos de data e hora do formulário). */
export function splitBr(v: string) {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2})[:h]?(\d{2})?)?/i);
  if (!m) return { date: "", time: "" };
  return { date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, time: m[4] ? `${pad(+m[4])}:${m[5] ?? "00"}` : "" };
}
export function joinBr(date: string, time: string) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${/^\d{2}:\d{2}$/.test(time) ? time : "00:00"}` : "";
}

/** Etapas do criar evento, na ordem (a revisão vem depois da última). */
export const STEP_LABELS = ["Tipo", "Informações", "Quando", "Onde", "Mapa", "Ingressos", "Artes", "Vendas"];

export const KIND_LABEL: Record<TypeKind, string> = { inteira: "Inteira", meia: "Meia", social: "Social", outro: "Especial" };
