"use client";

/* Mapa 3D do local (planta-modelo 40 × 60 m). As áreas vendáveis são ligadas aos setores de ingresso. */

export const MAP_AREAS = [
  { id: "stage", name: "Palco", x: 168, y: 16, w: 184, d: 46, h: 44, fixed: "Palco", color: "#3A3A40", cap: 0 },
  { id: "prem", name: "Área frontal", x: 122, y: 82, w: 276, d: 76, h: 8, cap: 1200 },
  { id: "pista", name: "Área central", x: 62, y: 170, w: 396, d: 126, h: 5, cap: 3600 },
  { id: "camE", name: "Lateral esquerda", x: 16, y: 82, w: 80, d: 146, h: 30, cap: 280 },
  { id: "camD", name: "Lateral direita", x: 426, y: 82, w: 80, d: 146, h: 30, cap: 280 },
  { id: "barE", name: "Bar", x: 16, y: 252, w: 54, d: 46, h: 18, fixed: "Bar", color: "#55555A", cap: 0 },
  { id: "barD", name: "Bar", x: 452, y: 252, w: 54, d: 46, h: 18, fixed: "Bar", color: "#55555A", cap: 0 },
  { id: "wc", name: "WC", x: 202, y: 314, w: 118, d: 30, h: 14, fixed: "Banheiros", color: "#E9E7E0", cap: 0 },
] as const;
export type MapArea = (typeof MAP_AREAS)[number];
export const SELLABLE_AREAS = MAP_AREAS.filter((a) => !("fixed" in a)).map((a) => a.id);
export const MAP_CAPACITY = MAP_AREAS.reduce((s, a) => s + a.cap, 0);
export const isFixedArea = (a: MapArea): a is Extract<MapArea, { fixed: string }> => "fixed" in a;

export type MapView = { rot: number; tilt: number };
export const VIEW_3D: MapView = { rot: -28, tilt: 56 };

function shade(hex: string, f: number) {
  const h = hex.replace("#", "");
  const ch = (i: number) => Math.round(parseInt(h.substr(i, 2), 16) * f).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** Palco 3D com controles de girar e alternar planta/3D. `sectorOf` devolve nome e cor do setor ligado a cada área. */
export function MapStage({ sectorOf, sel, onPick, view, setView, tag }: {
  sectorOf: (areaId: string) => { name: string; color: string } | undefined;
  sel: string | null;
  onPick: (areaId: string) => void;
  view: MapView;
  setView: (fn: (v: MapView) => MapView) => void;
  tag: string;
}) {
  return (
    <div className="m3-stage">
      <div className="m3-scene" style={{ transform: `rotateX(${view.tilt}deg) rotateZ(${view.rot}deg)` }}>
        <div className="m3-floor" />
        {MAP_AREAS.map((a) => {
          const fixed = isFixedArea(a);
          const sec = fixed ? undefined : sectorOf(a.id);
          const color = fixed ? a.color : sec?.color ?? "#8A8A90";
          const name = fixed ? a.name : sec?.name ?? a.name;
          const dark = fixed && a.id !== "wc";
          const style = { left: a.x, top: a.y, width: a.w, height: a.d, "--h": `${a.h}px`, "--c": color, "--cs": shade(color, 0.72) } as React.CSSProperties;
          return (
            <button key={a.id} className={`ar${dark ? " dark" : ""}${sel === a.id ? " sel" : ""}`} type="button" onClick={() => onPick(a.id)} aria-label={`${name}${a.cap ? `, ${a.cap} pessoas` : ""}`} style={style}>
              <span className="fc ftop"><span className="fc-l" style={{ transform: `rotateZ(${-view.rot}deg)` }}>{name}</span></span>
              <span className="fc s" /><span className="fc e" /><span className="fc n" /><span className="fc w" />
            </button>
          );
        })}
      </div>
      <div className="m3-ctl">
        <button className="m3-b" type="button" onClick={() => setView((v) => ({ ...v, rot: v.rot - 45 }))} aria-label="Girar para a esquerda"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /></svg></button>
        <button className="m3-b" type="button" onClick={() => setView((v) => ({ ...v, rot: v.rot + 45 }))} aria-label="Girar para a direita"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" /></svg></button>
        <button className={view.tilt === 0 ? "m3-b on" : "m3-b"} type="button" onClick={() => setView(() => ({ tilt: 0, rot: 0 }))}>Planta</button>
        <button className={view.tilt !== 0 ? "m3-b on" : "m3-b"} type="button" onClick={() => setView(() => VIEW_3D)}>3D</button>
      </div>
      <span className="m3-tag">{tag}</span>
    </div>
  );
}
