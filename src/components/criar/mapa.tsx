"use client";

import { useEffect, useRef, useState } from "react";
import { MapStage, VIEW_3D, type MapView } from "@/components/mapa3d";
import { effTypes, num } from "@/lib/criar/model";
import { KIND_COLOR, KIND_NAME, templatePlan, type PlanArea, type VenuePlan } from "@/lib/criar/plan";
import { PlanEditor } from "./plan-editor";
import { Spark, uploadImage, UploadIcon, type Ctx } from "./shared";

const GEN_LABELS = ["Lendo o rascunho e as anotações", "Identificando palco, setores e circulação", "Estimando medidas e lotação", "Montando o modelo 3D"];

/** `bare`: dentro da etapa Mapa do criar evento, que já tem o próprio título. */
export function MapaPane({ c, bare = false }: { c: Ctx; bare?: boolean }) {
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
    if (a.kind !== "setor") return { name: a.name, color: a.color ?? KIND_COLOR[a.kind] };
    const k = a.sector ? secById.get(a.sector) : undefined;
    return { name: k?.name || a.name, color: k?.color ?? "#8A8A90" };
  };
  const setPlan = (fn: (p: VenuePlan) => VenuePlan) => upd((o) => (o.plan ? { ...o, plan: fn(o.plan) } : o));
  const setArea = (id: string, patch: Partial<PlanArea>) => setPlan((p) => ({ ...p, areas: p.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  /* lotação vem dos ingressos cadastrados no setor (por data), não do tamanho da área */
  const sectorTickets = new Map(d.sectors.map((k) => [k.id, effTypes(k, d.autoMeia).reduce((s, t) => s + num(t.qty), 0)]));
  const areasOf = (sid: string) => (d.plan?.areas ?? []).filter((x) => x.kind === "setor" && x.sector === sid).length;
  const ticketsOf = (a: PlanArea) => {
    if (a.kind !== "setor") return KIND_NAME[a.kind];
    if (!a.sector) return "Sem setor de ingressos";
    const n = sectorTickets.get(a.sector) ?? 0, shared = areasOf(a.sector);
    return `${n.toLocaleString("pt-BR")} ingressos por data${shared > 1 ? ` · setor dividido em ${shared} áreas` : ""}`;
  };

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
      {!bare && <div className="ai-h"><h2 className="ce-ph">Mapa 3D do local</h2><span className="ai-badge"><Spark />Gerado por IA</span></div>}
      {!bare && <p className="pp">Mande uma foto de um rascunho, uma planta ou só descreva o espaço. A IA identifica palco, setores, bares e entradas e monta o mapa 3D que o público usa para escolher onde ficar. Depois você ajusta tudo no editor.</p>}
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
                tag={`${plan.source === "modelo" ? "Planta-modelo" : "Escala aproximada"} · ${plan.width} × ${plan.depth} m · ${[...new Set(plan.areas.filter((a) => a.kind === "setor" && a.sector).map((a) => a.sector!))].reduce((s, sid) => s + (sectorTickets.get(sid) ?? 0), 0).toLocaleString("pt-BR")} ingressos por data`} />
              <div className="m3-side">
                <div className="m3-sh"><b className="m3-t">Áreas encontradas</b><span className="m3-s">Ligue cada setor do mapa a um setor de ingressos.</span></div>
                {plan.areas.map((a) => (
                  <div key={a.id} className={sel === a.id ? "al sel" : "al"}>
                    <span className="al-sw" style={{ background: look(a).color }} aria-hidden="true" />
                    <span className="al-i"><b className="al-n">{a.name}</b><span className="al-c">{ticketsOf(a)}</span></span>
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
            <PlanEditor c={c} plan={plan} look={look} ticketsOf={ticketsOf} sel={sel} setSel={setSel} setPlan={setPlan} />
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
