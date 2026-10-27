"use client";

import { KIND_COLOR, type PlanArea, type VenuePlan } from "@/lib/criar/plan";

/* Mapa 3D do local, desenhado a partir da planta (metros) numa cena de 520 × 360. */

export type MapView = { rot: number; tilt: number };
export const VIEW_3D: MapView = { rot: -28, tilt: 56 };
const SCENE_W = 520, SCENE_H = 360;

function shade(hex: string, f: number) {
  const h = hex.replace("#", "");
  const ch = (i: number) => Math.round(parseInt(h.substr(i, 2), 16) * f).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** Nome e cor com que cada área aparece: setores usam o nome/cor do setor ligado. */
export type AreaLook = (a: PlanArea) => { name: string; color: string };
export const fixedLook = (a: PlanArea) => ({ name: a.name, color: a.kind === "setor" ? "#8A8A90" : KIND_COLOR[a.kind] });

export function MapStage({ plan, look, sel, onPick, view, setView, tag }: {
  plan: VenuePlan;
  look: AreaLook;
  sel: string | null;
  onPick: (areaId: string) => void;
  view: MapView;
  setView: (fn: (v: MapView) => MapView) => void;
  tag: string;
}) {
  const k = Math.min(SCENE_W / plan.width, SCENE_H / plan.depth);
  const ox = (SCENE_W - plan.width * k) / 2, oy = (SCENE_H - plan.depth * k) / 2;
  return (
    <div className="m3-stage">
      <div className="m3-scene" style={{ transform: `rotateX(${view.tilt}deg) rotateZ(${view.rot}deg)` }}>
        <div className="m3-floor" style={{ left: ox - 20, top: oy - 20, right: SCENE_W - ox - plan.width * k - 20, bottom: SCENE_H - oy - plan.depth * k - 20 }} />
        {plan.areas.map((a) => {
          const { name, color } = look(a);
          const dark = a.kind === "palco" || a.kind === "bar" || a.kind === "outro";
          const hpx = Math.min(48, Math.max(3, a.h * k * 3));
          const style = { left: ox + a.x * k, top: oy + a.y * k, width: a.w * k, height: a.d * k, "--h": `${hpx}px`, "--c": color, "--cs": shade(color, 0.72) } as React.CSSProperties;
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
