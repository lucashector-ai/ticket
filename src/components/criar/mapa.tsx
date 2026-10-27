"use client";

import { useEffect, useRef, useState } from "react";
import { MapStage, VIEW_3D, type MapView } from "@/components/mapa3d";
import {
  AREA_KINDS, KIND_COLOR, KIND_NAME, MAX_AREAS, planCapacity, suggestCap, templatePlan,
  type AreaKind, type PlanArea, type VenuePlan,
} from "@/lib/criar/plan";
import { Spark, uploadImage, UploadIcon, XIcon, type Ctx } from "./shared";

const GEN_LABELS = ["Lendo o rascunho e as anotações", "Identificando palco, setores e circulação", "Estimando medidas e lotação", "Montando o modelo 3D"];
const snap = (n: number) => Math.round(n * 2) / 2;

export function MapaPane({ c }: { c: Ctx }) {
  const { d, set, upd } = c;
  const [genStep, setGenStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [view, setView] = useState<MapView>(VIEW_3D);
  const [tab, setTab] = useState<"3d" | "editar">("3d");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  if (d.tmode !== "mapa") {
    return (
      <div className="pane">
        <h2 className="ce-ph">Mapa do local</h2>
        <div className="nomap"><b className="nm-t">Este evento vende ingressos sem mapa.</b><span className="nm-s">Para vender por setor com mapa, mude o tipo de venda na etapa Formato.</span><button className="b-sec" type="button" onClick={() => c.go(0)}>Ir para Formato</button></div>
      </div>
    );
  }

  const secById = new Map(d.sectors.map((k) => [k.id, k]));
  const look = (a: PlanArea) => {
    if (a.kind !== "setor") return { name: a.name, color: KIND_COLOR[a.kind] };
    const k = a.sector ? secById.get(a.sector) : undefined;
    return { name: k?.name || a.name, color: k?.color ?? "#8A8A90" };
  };
  const setPlan = (fn: (p: VenuePlan) => VenuePlan) => upd((o) => (o.plan ? { ...o, plan: fn(o.plan) } : o));
  const setArea = (id: string, patch: Partial<PlanArea>) => setPlan((p) => ({ ...p, areas: p.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  async function generate() {
    setGenerating(true);
    setGenStep(0);
    // os passos acompanham a espera da resposta; o último só fecha quando a planta chega
    timer.current = setInterval(() => setGenStep((s) => Math.min(s + 1, GEN_LABELS.length - 1)), 6000);
    const r = await fetch("/api/mapa/gerar", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sketchUrl: d.sketchUrl || null, prompt: d.prompt, sectors: d.sectors.map((k) => ({ id: k.id, name: k.name })) }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { plan?: VenuePlan; error?: string; remaining?: number } | null;
    if (timer.current) clearInterval(timer.current);
    setGenerating(false);
    if (!r?.ok || !j?.plan) { c.flash(j?.error ?? "Não foi possível gerar o mapa agora. Tente de novo."); return; }
    set({ map: "done", plan: j.plan });
    setView(VIEW_3D); setTab("3d"); setSel(null);
    c.flash(`Mapa 3D gerado: ${j.plan.areas.length} áreas encontradas`);
  }
  function useTemplate() {
    set({ map: "done", plan: templatePlan(d.sectors.map((k) => k.id)) });
    setView(VIEW_3D); setTab("3d"); setSel(null);
  }
  async function onSketch(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const r = await uploadImage(f);
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!r.ok) { c.flash(r.error); return; }
    set({ map: "sketch", sketchUrl: r.url });
  }

  const plan = d.map === "done" ? d.plan : null;
  return (
    <div className="pane">
      <div className="ai-h"><h2 className="ce-ph">Mapa 3D do local</h2><span className="ai-badge"><Spark />Gerado por IA</span></div>
      <p className="pp">Mande uma foto de um rascunho, uma planta ou só descreva o espaço. A IA identifica palco, setores, bares e entradas e monta o mapa 3D que o público usa para escolher onde ficar. Depois você ajusta tudo no editor.</p>
      <input ref={file} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Rascunho ou planta do local" onChange={(e) => void onSketch(e.target.files?.[0])} />

      {generating ? (
        <div className="gen">
          <div className="gen-v" aria-hidden="true"><div className="gen-grid" /><span className="gen-scan" /></div>
          <ol className="gen-l" aria-live="polite">{GEN_LABELS.map((l, i) => <li key={l} className={i < genStep ? "ok" : i === genStep ? "now" : ""}><span className="gs-i" aria-hidden="true" />{l}</li>)}</ol>
        </div>
      ) : d.map === "empty" || (d.map === "done" && !plan) ? (
        <div className="src">
          <button className="src-b drop" type="button" disabled={busy} onClick={() => file.current?.click()}>
            <span className="src-i" aria-hidden="true"><UploadIcon size={24} /></span>
            <b className="src-t">{busy ? "Enviando…" : "Enviar rascunho ou planta"}</b><span className="src-s">Foto do papel ou imagem da planta (JPG, PNG). Clique para escolher.</span>
          </button>
          <div className="src-col">
            <button className="src-b" type="button" onClick={() => set({ map: "sketch", sketchUrl: "" })}><b className="src-t">Descrever em texto</b><span className="src-s">&quot;Galpão 40×60 m, palco no fundo, camarotes nas laterais.&quot;</span></button>
            <div className="src-b tpl"><b className="src-t">Começar de um modelo</b><span className="src-s">Uma planta pronta de galpão para você ajustar no editor.</span><div className="chips"><button className="chip2" type="button" onClick={useTemplate}>Usar planta-modelo</button></div></div>
          </div>
        </div>
      ) : d.map === "sketch" ? (
        <div className={d.sketchUrl ? "sk" : "sk sk-txt"}>
          {d.sketchUrl && (
            <div className="sk-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.sketchUrl} alt="Rascunho enviado do local" style={{ display: "block", width: "100%", height: "auto" }} />
              <span className="sk-tag">{d.sketchUrl.split("/").pop()}</span>
            </div>
          )}
          <div className="sk-f">
            <label className="lf"><span className="lf-l">{d.sketchUrl ? "Conte mais sobre o espaço (opcional)" : "Descreva o espaço"}</span><textarea className="in ta" rows={4} value={d.prompt} maxLength={1000} onChange={(e) => set({ prompt: e.target.value })} placeholder="Galpão de uns 40 × 60 m. Palco no fundo, área premium na frente, camarotes nas laterais, bares no fundo e banheiros perto da entrada." /></label>
            <div className="sk-hints"><span className="hint2">Medidas aproximadas</span><span className="hint2">Onde fica o palco</span><span className="hint2">Saídas de emergência</span></div>
            <button className="b-pri" type="button" onClick={() => void generate()}><Spark size={16} />Gerar mapa 3D</button>
            <button className="b-ghost" type="button" onClick={() => (d.sketchUrl ? file.current?.click() : set({ map: "empty" }))}>{d.sketchUrl ? "Trocar arquivo" : "Voltar"}</button>
          </div>
        </div>
      ) : plan ? (
        <>
          <div className="mtab" role="tablist" aria-label="Visualização do mapa">
            <button type="button" role="tab" aria-selected={tab === "3d"} className={tab === "3d" ? "on" : ""} onClick={() => setTab("3d")}>Ver em 3D</button>
            <button type="button" role="tab" aria-selected={tab === "editar"} className={tab === "editar" ? "on" : ""} onClick={() => setTab("editar")}>Editar planta</button>
          </div>
          {tab === "3d" ? (
            <div className="m3 m3w">
              <MapStage plan={plan} look={look} sel={sel} onPick={setSel} view={view} setView={setView}
                tag={`${plan.source === "modelo" ? "Planta-modelo" : "Escala aproximada"} · ${plan.width} × ${plan.depth} m · ${planCapacity(plan).toLocaleString("pt-BR")} pessoas`} />
              <div className="m3-side">
                <div className="m3-sh"><b className="m3-t">Áreas encontradas</b><span className="m3-s">Ligue cada setor do mapa a um setor de ingressos.</span></div>
                {plan.areas.map((a) => (
                  <div key={a.id} className={sel === a.id ? "al sel" : "al"}>
                    <span className="al-sw" style={{ background: look(a).color }} aria-hidden="true" />
                    <span className="al-i"><b className="al-n">{a.name}</b><span className="al-c">{a.kind === "setor" ? `${a.cap.toLocaleString("pt-BR")} pessoas` : KIND_NAME[a.kind]}</span></span>
                    {a.kind === "setor" && (
                      <select className="al-sel" value={a.sector ?? ""} onChange={(e) => { setArea(a.id, { sector: e.target.value || null }); setSel(a.id); }} aria-label={`Setor de ingressos de ${a.name}`}>
                        <option value="">Sem setor</option>
                        {d.sectors.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                <MapActions c={c} canRegen={!!(d.sketchUrl || d.prompt.trim())} onRegen={() => void generate()} />
              </div>
            </div>
          ) : (
            <PlanEditor c={c} plan={plan} look={look} sel={sel} setSel={setSel} setPlan={setPlan} setArea={setArea} />
          )}
          {plan.notes.length > 0 && (
            <ul className="m3-notes">{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          <p className="m3-note">A IA pode errar medidas. Confira a lotação de cada área com a planta oficial do local antes de publicar.</p>
        </>
      ) : null}
    </div>
  );
}

function MapActions({ c, canRegen, onRegen }: { c: Ctx; canRegen: boolean; onRegen: () => void }) {
  return (
    <div className="m3-a">
      {canRegen && <button className="b-sec sm" type="button" onClick={onRegen}>Gerar de novo</button>}
      <button className="b-ghost sm" type="button" onClick={() => c.set({ map: "empty", sketchUrl: "", plan: null })}>Novo rascunho</button>
    </div>
  );
}

/* ---------- editor 2D da planta, por cima do rascunho ---------- */
function PlanEditor({ c, plan, look, sel, setSel, setPlan, setArea }: {
  c: Ctx; plan: VenuePlan; look: (a: PlanArea) => { name: string; color: string };
  sel: string | null; setSel: (id: string | null) => void;
  setPlan: (fn: (p: VenuePlan) => VenuePlan) => void; setArea: (id: string, patch: Partial<PlanArea>) => void;
}) {
  const { d } = c;
  const box = useRef<HTMLDivElement>(null);
  const [showSketch, setShowSketch] = useState(true);
  const area = plan.areas.find((a) => a.id === sel) ?? null;

  /** arrasta (move) ou redimensiona uma área; posições em metros, de meio em meio metro */
  function drag(ev: React.PointerEvent, a: PlanArea, mode: "move" | "size") {
    ev.preventDefault(); ev.stopPropagation();
    setSel(a.id);
    const rect = box.current!.getBoundingClientRect();
    const mx = plan.width / rect.width, my = plan.depth / rect.height;
    const x0 = ev.clientX, y0 = ev.clientY, start = { ...a };
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x0) * mx, dy = (e.clientY - y0) * my;
      if (mode === "move") {
        setArea(a.id, { x: Math.min(plan.width - start.w, Math.max(0, snap(start.x + dx))), y: Math.min(plan.depth - start.d, Math.max(0, snap(start.y + dy))) });
      } else {
        const w = Math.min(plan.width - start.x, Math.max(1, snap(start.w + dx))), dd = Math.min(plan.depth - start.y, Math.max(1, snap(start.d + dy)));
        setArea(a.id, { w, d: dd, ...(start.kind === "setor" && start.cap === suggestCap(start) ? { cap: suggestCap({ w, d: dd }) } : {}) });
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  function add(kind: AreaKind) {
    if (plan.areas.length >= MAX_AREAS) { c.flash(`No máximo ${MAX_AREAS} áreas.`); return; }
    const w = Math.min(kind === "setor" ? 12 : 6, plan.width), dd = Math.min(kind === "setor" ? 8 : 4, plan.depth);
    const a: PlanArea = {
      id: c.nid("ar"), name: kind === "setor" ? "Novo setor" : KIND_NAME[kind], kind,
      x: snap((plan.width - w) / 2), y: snap((plan.depth - dd) / 2), w, d: dd,
      h: kind === "palco" ? 1.5 : kind === "setor" ? 0.2 : 0.8, cap: kind === "setor" ? suggestCap({ w, d: dd }) : 0,
      sector: kind === "setor" ? d.sectors[0]?.id ?? null : null,
    };
    setPlan((p) => ({ ...p, areas: [...p.areas, a] }));
    setSel(a.id);
  }
  const num = (v: string) => Number.parseFloat(v.replace(",", ".")) || 0;

  return (
    <div className="pe">
      <div className="pe-bar">
        <label className="pe-dim">Local <input className="in sm2" inputMode="decimal" value={plan.width} onChange={(e) => setPlan((p) => ({ ...p, width: Math.max(5, num(e.target.value)) }))} aria-label="Largura do local em metros" /> × <input className="in sm2" inputMode="decimal" value={plan.depth} onChange={(e) => setPlan((p) => ({ ...p, depth: Math.max(5, num(e.target.value)) }))} aria-label="Profundidade do local em metros" /> m</label>
        {d.sketchUrl && <button className={showSketch ? "dy on" : "dy"} type="button" onClick={() => setShowSketch((s) => !s)}>Rascunho por baixo</button>}
      </div>
      <div className="pe-c" ref={box} style={{ aspectRatio: `${plan.width} / ${plan.depth}` }} onPointerDown={() => setSel(null)}>
        {d.sketchUrl && showSketch && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pe-bg" src={d.sketchUrl} alt="" aria-hidden="true" />
        )}
        <span className="pe-back" aria-hidden="true">fundo</span>
        <span className="pe-front" aria-hidden="true">entrada</span>
        {plan.areas.map((a) => {
          const { name, color } = look(a);
          return (
            <div key={a.id} className={sel === a.id ? "pa sel" : "pa"} role="button" tabIndex={0} aria-label={`${name}: ${a.w} × ${a.d} m`}
              style={{ left: `${(a.x / plan.width) * 100}%`, top: `${(a.y / plan.depth) * 100}%`, width: `${(a.w / plan.width) * 100}%`, height: `${(a.d / plan.depth) * 100}%`, background: color }}
              onPointerDown={(e) => drag(e, a, "move")} onKeyDown={(e) => {
                const step: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] };
                const s = step[e.key]; if (!s) return; e.preventDefault();
                setArea(a.id, { x: Math.min(plan.width - a.w, Math.max(0, a.x + s[0])), y: Math.min(plan.depth - a.d, Math.max(0, a.y + s[1])) });
              }}>
              <span className={a.kind === "palco" || a.kind === "bar" || a.kind === "outro" ? "pa-n dark" : "pa-n"}>{name}</span>
              <span className="pa-h" onPointerDown={(e) => drag(e, a, "size")} aria-hidden="true" />
            </div>
          );
        })}
      </div>
      <div className="add-sec">
        <span className="add-l">Adicionar:</span>
        {AREA_KINDS.filter((k) => k !== "outro").map((k) => <button key={k} className="add-b" type="button" onClick={() => add(k)}>+ {KIND_NAME[k]}</button>)}
      </div>
      {area ? (
        <div className="pe-f">
          <div className="pe-r">
            <label className="lf"><span className="tl-l2">Nome</span><input className="in sm2" value={area.name} maxLength={60} onChange={(e) => setArea(area.id, { name: e.target.value })} /></label>
            <label className="lf"><span className="tl-l2">Tipo</span>
              <select className="in sm2" value={area.kind} onChange={(e) => { const kind = e.target.value as AreaKind; setArea(area.id, { kind, cap: kind === "setor" ? area.cap || suggestCap(area) : 0, sector: kind === "setor" ? area.sector : null }); }}>
                {AREA_KINDS.map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
              </select>
            </label>
            {area.kind === "setor" && (
              <label className="lf"><span className="tl-l2">Setor de ingressos</span>
                <select className="in sm2" value={area.sector ?? ""} onChange={(e) => setArea(area.id, { sector: e.target.value || null })}>
                  <option value="">Sem setor</option>
                  {d.sectors.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="pe-r">
            <label className="lf"><span className="tl-l2">Largura (m)</span><input className="in sm2" inputMode="decimal" value={area.w} onChange={(e) => setArea(area.id, { w: Math.min(plan.width - area.x, Math.max(1, num(e.target.value))) })} /></label>
            <label className="lf"><span className="tl-l2">Profundidade (m)</span><input className="in sm2" inputMode="decimal" value={area.d} onChange={(e) => setArea(area.id, { d: Math.min(plan.depth - area.y, Math.max(1, num(e.target.value))) })} /></label>
            <label className="lf"><span className="tl-l2">Altura (m)</span><input className="in sm2" inputMode="decimal" value={area.h} onChange={(e) => setArea(area.id, { h: Math.min(6, Math.max(0.1, num(e.target.value))) })} /></label>
            {area.kind === "setor" && (
              <label className="lf"><span className="tl-l2">Lotação</span><input className="in sm2" inputMode="numeric" value={area.cap} onChange={(e) => setArea(area.id, { cap: Math.max(0, Math.round(num(e.target.value))) })} /></label>
            )}
          </div>
          <div className="pe-r pe-a">
            {area.kind === "setor" && area.cap !== suggestCap(area) && (
              <button className="sug-b" type="button" onClick={() => setArea(area.id, { cap: suggestCap(area) })}>Usar lotação sugerida: {suggestCap(area).toLocaleString("pt-BR")} (2,5 pessoas/m²)</button>
            )}
            <span className="cf-sp" />
            <button className="mi-x" type="button" onClick={() => { setPlan((p) => ({ ...p, areas: p.areas.filter((x) => x.id !== area.id) })); setSel(null); }}><XIcon /> Remover área</button>
          </div>
        </div>
      ) : (
        <p className="m3-s">Arraste as áreas para mover e o canto de baixo para mudar o tamanho. Toque numa área para editar nome, tipo, setor e lotação.</p>
      )}
    </div>
  );
}
