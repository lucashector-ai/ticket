/* Planta do local: áreas retangulares em metros (gerada pela IA a partir do rascunho e ajustada pelo produtor). */

export const AREA_KINDS = ["setor", "palco", "bar", "banheiro", "entrada", "outro"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export const KIND_NAME: Record<AreaKind, string> = { setor: "Setor", palco: "Palco", bar: "Bar", banheiro: "Banheiros", entrada: "Entrada", outro: "Outro" };
/** Cores das áreas que não são setor, no estilo "massinha" do mapa 3D (palco em coral, o resto em tons suaves). */
export const KIND_COLOR: Record<Exclude<AreaKind, "setor">, string> = { palco: "#FF6A4D", bar: "#8CC79E", banheiro: "#BFD8EE", entrada: "#E9DCC0", outro: "#D5CDBE" };

/** Cor do tabuleiro (fundo) do mapa 3D quando o produtor não escolhe outra. */
export const DEFAULT_FLOOR = "#F1E5CA";
/** Paleta sugerida no editor (tons de massinha); qualquer cor pode ser escolhida. */
export const MAP_SWATCHES = ["#FF6A4D", "#FF8AD8", "#D7F264", "#8FB8FF", "#8CC79E", "#BFD8EE", "#FFC764", "#B79CFF", "#E9DCC0", "#3A3A3C"];
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);

/** x/y: canto de cima à esquerda, a partir do fundo do local (y = 0 é a parede do fundo).
 *  `color`: cor escolhida para áreas que não são setor (setores usam a cor do setor de ingressos). */
export type PlanArea = { id: string; name: string; kind: AreaKind; x: number; y: number; w: number; d: number; h: number; cap: number; sector: string | null; color?: string };
/** `floor`: cor do tabuleiro (fundo) do mapa. */
export type VenuePlan = { width: number; depth: number; areas: PlanArea[]; notes: string[]; source: "ia" | "modelo"; floor?: string };

/** Pessoas por m² em pé (pista); usada para sugerir a lotação de uma área. */
export const STANDING_DENSITY = 2.5;
export const MAX_AREAS = 40;
export const suggestCap = (a: { w: number; d: number }) => Math.max(0, Math.round(a.w * a.d * STANDING_DENSITY));
const r1 = (n: number) => Math.round(n * 2) / 2;

/** Planta-modelo de galpão 60 × 42 m, usada para começar sem rascunho. */
export function templatePlan(sectorIds: string[]): VenuePlan {
  const s = (i: number) => sectorIds[Math.min(i, sectorIds.length - 1)] ?? null;
  const areas: PlanArea[] = [
    { id: "stage", name: "Palco", kind: "palco", x: 19.5, y: 2, w: 21, d: 5.5, h: 1.5, cap: 0, sector: null },
    { id: "prem", name: "Área frontal", kind: "setor", x: 14, y: 9.5, w: 32, d: 9, h: 0.3, cap: 720, sector: s(0) },
    { id: "pista", name: "Área central", kind: "setor", x: 7, y: 19.5, w: 46, d: 14.5, h: 0.2, cap: 1670, sector: s(1) },
    { id: "camE", name: "Lateral esquerda", kind: "setor", x: 2, y: 9.5, w: 9, d: 17, h: 1.2, cap: 280, sector: s(2) },
    { id: "camD", name: "Lateral direita", kind: "setor", x: 49, y: 9.5, w: 9, d: 17, h: 1.2, cap: 280, sector: s(2) },
    { id: "barE", name: "Bar", kind: "bar", x: 2, y: 29, w: 6, d: 5.5, h: 0.8, cap: 0, sector: null },
    { id: "barD", name: "Bar", kind: "bar", x: 52, y: 29, w: 6, d: 5.5, h: 0.8, cap: 0, sector: null },
    { id: "wc", name: "Banheiros", kind: "banheiro", x: 23, y: 36, w: 14, d: 3.5, h: 0.6, cap: 0, sector: null },
  ];
  return { width: 60, depth: 42, areas, notes: [], source: "modelo" };
}

/** Garante uma planta válida: dentro dos limites, tamanhos mínimos, setores existentes. */
export function normalizePlan(p: VenuePlan, sectorIds: string[]): VenuePlan {
  const width = Math.min(500, Math.max(5, r1(p.width) || 40));
  const depth = Math.min(500, Math.max(5, r1(p.depth) || 30));
  const areas = p.areas.slice(0, MAX_AREAS).map((a, i) => {
    const w = Math.min(width, Math.max(1, r1(a.w)));
    const d = Math.min(depth, Math.max(1, r1(a.d)));
    const kind = (AREA_KINDS as readonly string[]).includes(a.kind) ? a.kind : "outro";
    return {
      id: a.id || `a${i}`, name: (a.name || KIND_NAME[kind]).slice(0, 60), kind,
      x: Math.min(width - w, Math.max(0, r1(a.x))), y: Math.min(depth - d, Math.max(0, r1(a.y))), w, d,
      h: Math.min(6, Math.max(0.1, Math.round((a.h || 0.3) * 10) / 10)),
      cap: kind === "setor" ? Math.min(200_000, Math.max(0, Math.round(a.cap || 0))) : 0,
      sector: kind === "setor" && a.sector && sectorIds.includes(a.sector) ? a.sector : null,
      ...(isHex(a.color) ? { color: a.color } : {}),
    };
  });
  return { width, depth, areas, notes: p.notes.slice(0, 8).map((n) => n.slice(0, 240)), source: p.source, ...(isHex(p.floor) ? { floor: p.floor } : {}) };
}

export const planCapacity = (p: VenuePlan) => p.areas.reduce((s, a) => s + (a.kind === "setor" ? a.cap : 0), 0);
