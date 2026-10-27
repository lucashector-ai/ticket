"use client";

import { useRef, useState } from "react";
import { AREA_KINDS, KIND_NAME, MAX_AREAS, type AreaKind, type PlanArea, type VenuePlan } from "@/lib/criar/plan";
import { XIcon, type Ctx } from "./shared";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Guides = { v: number[]; h: number[] };
const HANDLES: Exclude<Handle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const GRIDS = [{ v: 0, label: "Livre" }, { v: 0.5, label: "0,5 m" }, { v: 1, label: "1 m" }];
/** distância (em px da tela) em que uma borda gruda na outra */
const SNAP_PX = 7;
const round1 = (n: number) => Math.round(n * 10) / 10;
/** 5.5 → "5,5" (metros no padrão brasileiro) */
const m = (n: number) => String(round1(n)).replace(".", ",");

/** Procura o alvo mais perto de uma das bordas que se movem; devolve o ajuste e onde desenhar a guia. */
function snapAxis(edges: number[], targets: number[], tol: number) {
  let best: { delta: number; at: number } | null = null;
  for (const e of edges) for (const t of targets) {
    const delta = t - e;
    if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
  }
  return best;
}

export function PlanEditor({ c, plan, look, ticketsOf, sel, setSel, setPlan }: {
  c: Ctx; plan: VenuePlan;
  look: (a: PlanArea) => { name: string; color: string };
  ticketsOf: (a: PlanArea) => string;
  sel: string | null; setSel: (id: string | null) => void;
  setPlan: (fn: (p: VenuePlan) => VenuePlan) => void;
}) {
  const { d } = c;
  const box = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState(0.5);
  const [smart, setSmart] = useState(true);
  const [showSketch, setShowSketch] = useState(true);
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [dragging, setDragging] = useState(false);
  const [hist, setHist] = useState<{ past: VenuePlan[]; future: VenuePlan[] }>({ past: [], future: [] });
  const area = plan.areas.find((a) => a.id === sel) ?? null;

  /* ---------- histórico (desfazer / refazer) ---------- */
  const checkpoint = () => setHist((h) => ({ past: [...h.past.slice(-49), plan], future: [] }));
  const undo = () => {
    const prev = hist.past.at(-1);
    if (!prev) return;
    setHist((h) => ({ past: h.past.slice(0, -1), future: [...h.future, plan] }));
    setPlan(() => prev);
  };
  const redo = () => {
    const next = hist.future.at(-1);
    if (!next) return;
    setHist((h) => ({ past: [...h.past, plan], future: h.future.slice(0, -1) }));
    setPlan(() => next);
  };
  const setArea = (id: string, patch: Partial<PlanArea>) => setPlan((p) => ({ ...p, areas: p.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const change = (id: string, patch: Partial<PlanArea>) => { checkpoint(); setArea(id, patch); };

  /* ---------- arrastar e redimensionar com grade e guias ---------- */
  function drag(ev: React.PointerEvent, a: PlanArea, handle: Handle) {
    if (ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    box.current?.focus({ preventScroll: true });
    setSel(a.id);
    checkpoint();
    setDragging(true);
    const rect = box.current!.getBoundingClientRect();
    const mx = plan.width / rect.width, my = plan.depth / rect.height;
    const tolX = SNAP_PX * mx, tolY = SNAP_PX * my;
    const others = plan.areas.filter((o) => o.id !== a.id);
    const tx = [0, plan.width / 2, plan.width, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ty = [0, plan.depth / 2, plan.depth, ...others.flatMap((o) => [o.y, o.y + o.d / 2, o.y + o.d])];
    const g = grid || 0.1;
    const toGrid = (n: number) => Math.round(n / g) * g;
    const x0 = ev.clientX, y0 = ev.clientY, s = { ...a };

    const move = (e: PointerEvent) => {
      let dx = (e.clientX - x0) * mx, dy = (e.clientY - y0) * my;
      const lines: Guides = { v: [], h: [] };
      if (handle === "move") {
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        let x = s.x + dx, y = s.y + dy;
        const sx = smart ? snapAxis([x, x + s.w / 2, x + s.w], tx, tolX) : null;
        if (sx) { x += sx.delta; lines.v.push(sx.at); } else x = toGrid(x);
        const sy = smart ? snapAxis([y, y + s.d / 2, y + s.d], ty, tolY) : null;
        if (sy) { y += sy.delta; lines.h.push(sy.at); } else y = toGrid(y);
        setArea(a.id, { x: round1(Math.min(plan.width - s.w, Math.max(0, x))), y: round1(Math.min(plan.depth - s.d, Math.max(0, y))) });
      } else {
        let { x, y, w, d: dd } = s;
        const edge = (v: number, targets: number[], tol: number, list: number[]) => {
          const hit = smart ? snapAxis([v], targets, tol) : null;
          if (hit) { list.push(hit.at); return v + hit.delta; }
          return toGrid(v);
        };
        if (handle.includes("e")) w = Math.max(1, Math.min(plan.width, edge(s.x + s.w + dx, tx, tolX, lines.v)) - s.x);
        if (handle.includes("w")) { const left = Math.max(0, Math.min(s.x + s.w - 1, edge(s.x + dx, tx, tolX, lines.v))); w = s.x + s.w - left; x = left; }
        if (handle.includes("s")) dd = Math.max(1, Math.min(plan.depth, edge(s.y + s.d + dy, ty, tolY, lines.h)) - s.y);
        if (handle.startsWith("n")) { const top = Math.max(0, Math.min(s.y + s.d - 1, edge(s.y + dy, ty, tolY, lines.h))); dd = s.y + s.d - top; y = top; }
        setArea(a.id, { x: round1(x), y: round1(y), w: round1(w), d: round1(dd) });
      }
      setGuides(lines);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGuides({ v: [], h: [] });
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ---------- ações ---------- */
  function add(kind: AreaKind) {
    if (plan.areas.length >= MAX_AREAS) { c.flash(`No máximo ${MAX_AREAS} áreas.`); return; }
    const w = Math.min(kind === "setor" ? 12 : 6, plan.width), dd = Math.min(kind === "setor" ? 8 : 4, plan.depth);
    const a: PlanArea = {
      id: c.nid("ar"), name: kind === "setor" ? "Novo setor" : KIND_NAME[kind], kind,
      x: Math.round((plan.width - w) / 2), y: Math.round((plan.depth - dd) / 2), w, d: dd,
      h: kind === "palco" ? 1.5 : kind === "setor" ? 0.2 : 0.8, cap: 0,
      sector: kind === "setor" ? d.sectors[0]?.id ?? null : null,
    };
    checkpoint();
    setPlan((p) => ({ ...p, areas: [...p.areas, a] }));
    setSel(a.id);
  }
  function duplicate(a: PlanArea) {
    if (plan.areas.length >= MAX_AREAS) { c.flash(`No máximo ${MAX_AREAS} áreas.`); return; }
    const copy = { ...a, id: c.nid("ar"), x: Math.min(plan.width - a.w, a.x + 1), y: Math.min(plan.depth - a.d, a.y + 1) };
    checkpoint();
    setPlan((p) => ({ ...p, areas: [...p.areas, copy] }));
    setSel(copy.id);
  }
  function remove(a: PlanArea) {
    checkpoint();
    setPlan((p) => ({ ...p, areas: p.areas.filter((x) => x.id !== a.id) }));
    setSel(null);
  }
  function onKey(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (!area) return;
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(area); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(area); return; }
    if (e.key === "Escape") { setSel(null); return; }
    const step = (grid || 0.1) * (e.shiftKey ? 4 : 1);
    const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const s = dir[e.key];
    if (!s) return;
    e.preventDefault();
    change(area.id, { x: round1(Math.min(plan.width - area.w, Math.max(0, area.x + s[0]))), y: round1(Math.min(plan.depth - area.d, Math.max(0, area.y + s[1]))) });
  }
  const num = (v: string) => Number.parseFloat(v.replace(",", ".")) || 0;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  /* quadriculado: linha fina no passo da grade e linha forte a cada 5 m */
  const minor = `${((grid || 1) / plan.width) * 100}% ${((grid || 1) / plan.depth) * 100}%`;
  const major = `${(5 / plan.width) * 100}% ${(5 / plan.depth) * 100}%`;

  return (
    <div className="pe">
      <div className="pe-tb" role="toolbar" aria-label="Ferramentas da planta">
        <div className="pe-grp">
          <button className="pe-ib" type="button" onClick={undo} disabled={!hist.past.length} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg></button>
          <button className="pe-ib" type="button" onClick={redo} disabled={!hist.future.length} aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg></button>
        </div>
        <div className="pe-grp" role="radiogroup" aria-label="Grade">
          <span className="pe-l">Grade</span>
          {GRIDS.map((gr) => <button key={gr.v} className={grid === gr.v ? "pe-sg on" : "pe-sg"} type="button" role="radio" aria-checked={grid === gr.v} onClick={() => setGrid(gr.v)}>{gr.label}</button>)}
        </div>
        <button className={smart ? "pe-sg on" : "pe-sg"} type="button" aria-pressed={smart} onClick={() => setSmart((v) => !v)} title="Grudar nas bordas e centros das outras áreas">Guias de alinhamento</button>
        {d.sketchUrl && <button className={showSketch ? "pe-sg on" : "pe-sg"} type="button" aria-pressed={showSketch} onClick={() => setShowSketch((v) => !v)}>Rascunho por baixo</button>}
        <label className="pe-dim">Local <input className="in sm2" inputMode="decimal" value={plan.width} onFocus={checkpoint} onChange={(e) => setPlan((p) => ({ ...p, width: Math.max(5, num(e.target.value)) }))} aria-label="Largura do local em metros" /> × <input className="in sm2" inputMode="decimal" value={plan.depth} onFocus={checkpoint} onChange={(e) => setPlan((p) => ({ ...p, depth: Math.max(5, num(e.target.value)) }))} aria-label="Profundidade do local em metros" /> m</label>
      </div>

      <div className="pe-c" ref={box} tabIndex={0} onKeyDown={onKey} aria-label="Planta do local. Setas movem a área selecionada; Delete remove; Ctrl+D duplica; Ctrl+Z desfaz."
        style={{ aspectRatio: `${plan.width} / ${plan.depth}`, backgroundSize: `${minor}, ${minor}, ${major}, ${major}` }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        {d.sketchUrl && showSketch && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pe-bg" src={d.sketchUrl} alt="" aria-hidden="true" />
        )}
        <span className="pe-back" aria-hidden="true">fundo</span>
        <span className="pe-front" aria-hidden="true">entrada</span>
        {plan.areas.map((a) => {
          const { name, color } = look(a);
          const on = sel === a.id;
          return (
            <div key={a.id} className={on ? "pa sel" : "pa"} role="button" tabIndex={-1} aria-label={`${name}: ${m(a.w)} × ${m(a.d)} m`}
              style={{ left: pct(a.x, plan.width), top: pct(a.y, plan.depth), width: pct(a.w, plan.width), height: pct(a.d, plan.depth), background: color }}
              onPointerDown={(e) => drag(e, a, "move")}>
              <span className={a.kind === "palco" || a.kind === "bar" || a.kind === "outro" ? "pa-n dark" : "pa-n"}>{name}</span>
              {on && HANDLES.map((h) => <span key={h} className={`pa-h h-${h}`} onPointerDown={(e) => drag(e, a, h)} aria-hidden="true" />)}
              {on && <span className="pa-sz" aria-hidden="true">{m(a.w)} × {m(a.d)} m</span>}
            </div>
          );
        })}
        {guides.v.map((x, i) => <span key={`v${i}`} className="pe-gv" style={{ left: pct(x, plan.width) }} aria-hidden="true" />)}
        {guides.h.map((y, i) => <span key={`h${i}`} className="pe-gh" style={{ top: pct(y, plan.depth) }} aria-hidden="true" />)}
      </div>

      <div className="add-sec">
        <span className="add-l">Adicionar:</span>
        {AREA_KINDS.filter((k) => k !== "outro").map((k) => <button key={k} className="add-b" type="button" onClick={() => add(k)}>+ {KIND_NAME[k]}</button>)}
      </div>

      {area ? (
        <div className="pe-f">
          <div className="pe-r">
            <label className="lf"><span className="tl-l2">Nome</span><input className="in sm2" value={area.name} maxLength={60} onFocus={checkpoint} onChange={(e) => setArea(area.id, { name: e.target.value })} /></label>
            <label className="lf"><span className="tl-l2">Tipo</span>
              <select className="in sm2" value={area.kind} onChange={(e) => { const kind = e.target.value as AreaKind; change(area.id, { kind, sector: kind === "setor" ? area.sector ?? d.sectors[0]?.id ?? null : null }); }}>
                {AREA_KINDS.map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
              </select>
            </label>
            {area.kind === "setor" && (
              <label className="lf"><span className="tl-l2">Setor de ingressos</span>
                <select className="in sm2" value={area.sector ?? ""} onChange={(e) => change(area.id, { sector: e.target.value || null })}>
                  <option value="">Sem setor</option>
                  {d.sectors.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="pe-r">
            {([["x", "X (m)"], ["y", "Y (m)"], ["w", "Largura (m)"], ["d", "Profundidade (m)"], ["h", "Altura (m)"]] as const).map(([key, label]) => (
              <label key={key} className="lf"><span className="tl-l2">{label}</span>
                <input className="in sm2" inputMode="decimal" value={area[key]} onFocus={checkpoint} onChange={(e) => {
                  const v = num(e.target.value);
                  const lim = { x: plan.width - area.w, y: plan.depth - area.d, w: plan.width - area.x, d: plan.depth - area.y, h: 6 }[key];
                  const min = key === "x" || key === "y" ? 0 : key === "h" ? 0.1 : 1;
                  setArea(area.id, { [key]: Math.min(lim, Math.max(min, v)) });
                }} />
              </label>
            ))}
          </div>
          {area.kind === "setor" && <p className="pe-cap">{ticketsOf(area)}</p>}
          <div className="pe-a">
            <button className="pe-sg" type="button" onClick={() => change(area.id, { x: round1((plan.width - area.w) / 2) })}>Centralizar na largura</button>
            <button className="pe-sg" type="button" onClick={() => change(area.id, { y: round1((plan.depth - area.d) / 2) })}>Centralizar na profundidade</button>
            <button className="pe-sg" type="button" onClick={() => duplicate(area)} title="Ctrl+D">Duplicar</button>
            <span className="cf-sp" />
            <button className="mi-x" type="button" onClick={() => remove(area)}><XIcon /> Remover área</button>
          </div>
        </div>
      ) : (
        <p className="m3-s">{dragging ? "" : "Arraste para mover; as bordas grudam na grade e nas outras áreas (segure Shift para travar a direção). Toque numa área para ver as alças de tamanho. Setas movem, Delete remove, Ctrl+D duplica, Ctrl+Z desfaz."}</p>
      )}
    </div>
  );
}
