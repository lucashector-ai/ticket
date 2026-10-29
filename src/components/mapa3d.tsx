"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_FLOOR, KIND_COLOR, type PlanArea, type VenuePlan } from "@/lib/criar/plan";

/* Mapa 3D do local, desenhado a partir da planta (metros) numa cena de 520 × 360.
   Todas as áreas têm a mesma altura baixinha; cada uma é um bloco sólido de cantos arredondados
   (fatias empilhadas, sem paredes soltas) e o nome fica num balão de frente para quem vê. */

export type MapView = { rot: number; tilt: number };
export const VIEW_3D: MapView = { rot: -28, tilt: 56 };
const SCENE_W = 520, SCENE_H = 360;
/** altura de todas as áreas na cena (px) e o passo entre as fatias do bloco */
const BLOCK_H = 10, SLICE = 2;
const SLICES = Array.from({ length: BLOCK_H / SLICE }, (_, i) => i * SLICE);
/** margem do tabuleiro em volta da planta (px da cena) */
const PAD = 20;

function shade(hex: string, f: number) {
  const h = hex.replace("#", "");
  const ch = (i: number) => Math.min(255, Math.round(parseInt(h.substr(i, 2), 16) * f)).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}
/** mistura com branco (0 = a cor, 1 = branco) */
function tint(hex: string, f: number) {
  const h = hex.replace("#", "");
  const ch = (i: number) => { const v = parseInt(h.substr(i, 2), 16); return Math.round(v + (255 - v) * f).toString(16).padStart(2, "0"); };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** Nome e cor com que cada área aparece: setores usam o nome/cor do setor ligado. */
export type AreaLook = (a: PlanArea) => { name: string; color: string };
export const fixedLook = (a: PlanArea) => ({ name: a.name, color: a.color ?? (a.kind === "setor" ? "#B9B2A4" : KIND_COLOR[a.kind]) });

/** Quanto a cena precisa encolher para o tabuleiro inteiro caber no palco, no ângulo atual. */
function fitScale(stage: { w: number; h: number }, plan: { w: number; h: number }, view: MapView) {
  if (!stage.w || !stage.h) return 1;
  const r = (view.rot * Math.PI) / 180, t = (view.tilt * Math.PI) / 180;
  const w = plan.w * Math.abs(Math.cos(r)) + plan.h * Math.abs(Math.sin(r));
  const h = (plan.w * Math.abs(Math.sin(r)) + plan.h * Math.abs(Math.cos(r))) * Math.cos(t) + 40;
  return Math.min(1.25, (stage.w - 32) / w, (stage.h - 96) / h);
}

export function MapStage({ plan, look, sel, onPick, view, setView, tag }: {
  plan: VenuePlan;
  look: AreaLook;
  sel: string | null;
  onPick: (areaId: string) => void;
  view: MapView;
  setView: (fn: (v: MapView) => MapView) => void;
  tag?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = Math.min(SCENE_W / plan.width, SCENE_H / plan.depth);
  const pw = plan.width * k, pd = plan.depth * k;
  const ox = (SCENE_W - pw) / 2, oy = (SCENE_H - pd) / 2;
  const floor = plan.floor ?? DEFAULT_FLOOR;
  const scale = fitScale(stage, { w: pw + PAD * 2, h: pd + PAD * 2 }, view);
  const stageStyle = { "--fl": floor, "--fl2": shade(floor, 0.88), "--bg1": tint(floor, 0.82), "--bg2": tint(floor, 0.45) } as React.CSSProperties;

  return (
    <div className="m3-stage" ref={stageRef} style={stageStyle}>
      <div className="m3-scene" style={{ transform: `scale(${scale}) rotateX(${view.tilt}deg) rotateZ(${view.rot}deg)` }}>
        <div className="m3-floor" style={{ left: ox - PAD, top: oy - PAD, width: pw + PAD * 2, height: pd + PAD * 2 }} />
        {plan.areas.map((a) => {
          const { name, color } = look(a);
          // cantos arredondados proporcionais ao tamanho (áreas pequenas ficam "pílulas")
          const r = Math.min(14, Math.max(4, Math.min(a.w, a.d) * k * 0.22));
          const style = { left: ox + a.x * k, top: oy + a.y * k, width: a.w * k, height: a.d * k, "--c": color, "--cd": shade(color, 0.74), "--r": `${r}px` } as React.CSSProperties;
          return (
            <button key={a.id} className={sel === a.id ? "ar sel" : "ar"} type="button" onClick={() => onPick(a.id)} aria-label={name} style={style}>
              <span className="fc fsh" aria-hidden="true" />
              {SLICES.map((z) => <span key={z} className="fc sl" style={{ transform: `translateZ(${z}px)` }} aria-hidden="true" />)}
              <span className="fc ftop" style={{ transform: `translateZ(${BLOCK_H}px)` }} aria-hidden="true" />
            </button>
          );
        })}
        {plan.areas.map((a) => {
          const { name, color } = look(a);
          return (
            <span key={`p-${a.id}`} className="mpin" aria-hidden="true"
              style={{ left: ox + (a.x + a.w / 2) * k, top: oy + (a.y + a.d / 2) * k, transform: `translateZ(${BLOCK_H + 8}px) rotateZ(${-view.rot}deg) rotateX(${-view.tilt}deg)` }}>
              <span className={`mpin-b${a.kind === "setor" ? " sec" : ""}${sel === a.id ? " on" : ""}`} onClick={() => onPick(a.id)}>
                <i style={{ background: color }} />{name}
              </span>
            </span>
          );
        })}
      </div>
      <div className="m3-ctl">
        <button className="m3-b" type="button" onClick={() => setView((v) => ({ ...v, rot: v.rot - 45 }))} aria-label="Girar para a esquerda"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /></svg></button>
        <button className="m3-b" type="button" onClick={() => setView((v) => ({ ...v, rot: v.rot + 45 }))} aria-label="Girar para a direita"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" /></svg></button>
        <button className={view.tilt === 0 ? "m3-b on" : "m3-b"} type="button" onClick={() => setView(() => ({ tilt: 0, rot: 0 }))}>Planta</button>
        <button className={view.tilt !== 0 ? "m3-b on" : "m3-b"} type="button" onClick={() => setView(() => VIEW_3D)}>3D</button>
      </div>
      {tag && <span className="m3-tag">{tag}</span>}
    </div>
  );
}
