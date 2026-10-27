"use client";

import { useEffect, useRef, useState } from "react";
import { isFixedArea, MAP_AREAS, MAP_CAPACITY, MapStage, SELLABLE_AREAS, VIEW_3D, type MapView } from "@/components/mapa3d";
import { Chevron, Spark, uploadImage, UploadIcon, type Ctx } from "./shared";

const GEN_LABELS = ["Lendo o rascunho e as anotações", "Identificando palco, setores e circulação", "Estimando medidas e lotação", "Montando o modelo 3D"];

export function MapaPane({ c }: { c: Ctx }) {
  const { d, set, upd } = c;
  const [genStep, setGenStep] = useState(0);
  const [view, setView] = useState<MapView>(VIEW_3D);
  const [sel, setSel] = useState("prem");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (d.tmode !== "mapa") {
    return (
      <div className="pane">
        <h2 className="ce-ph">Mapa do local</h2>
        <div className="nomap"><b className="nm-t">Este evento vende ingressos sem mapa.</b><span className="nm-s">Para vender por setor com mapa, mude o tipo de venda na etapa Formato.</span><button className="b-sec" type="button" onClick={() => c.go(0)}>Ir para Formato</button></div>
      </div>
    );
  }

  const secById = new Map(d.sectors.map((k) => [k.id, k]));
  const sectorOf = (areaId: string) => secById.get(d.areaMap[areaId] ?? "");

  function runGen() {
    setGenerating(true);
    setGenStep(0);
    const tick = (k: number) => {
      timer.current = setTimeout(() => {
        if (k < GEN_LABELS.length) { setGenStep(k + 1); tick(k + 1); return; }
        // liga as áreas aos setores existentes, na ordem
        upd((o) => {
          const ids = o.sectors.map((s) => s.id);
          const areaMap: Record<string, string> = {};
          SELLABLE_AREAS.forEach((a, i) => { areaMap[a] = o.areaMap[a] && ids.includes(o.areaMap[a]) ? o.areaMap[a] : ids[Math.min(i, ids.length - 1)]; });
          return { ...o, map: "done", areaMap };
        });
        setGenerating(false);
        setView(VIEW_3D);
        c.flash(`Mapa 3D gerado: ${MAP_AREAS.length} áreas encontradas`);
      }, 750);
    };
    tick(0);
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

  return (
    <div className="pane">
      <div className="ai-h"><h2 className="ce-ph">Mapa 3D do local</h2><span className="ai-badge"><Spark />Gerado por IA</span></div>
      <p className="pp">Mande uma foto de um rascunho, uma planta ou só descreva o espaço. A IA identifica palco, setores, bares e entradas e monta o mapa 3D que o público usa para escolher onde ficar.</p>
      <input ref={file} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Rascunho ou planta do local" onChange={(e) => void onSketch(e.target.files?.[0])} />

      {generating ? (
        <div className="gen">
          <div className="gen-v" aria-hidden="true"><div className="gen-grid" /><span className="gen-scan" /></div>
          <ol className="gen-l">{GEN_LABELS.map((l, i) => <li key={l} className={i < genStep ? "ok" : i === genStep ? "now" : ""}><span className="gs-i" aria-hidden="true" />{l}</li>)}</ol>
        </div>
      ) : d.map === "empty" ? (
        <div className="src">
          <button className="src-b drop" type="button" disabled={busy} onClick={() => file.current?.click()}>
            <span className="src-i" aria-hidden="true"><UploadIcon size={24} /></span>
            <b className="src-t">{busy ? "Enviando…" : "Enviar rascunho ou planta"}</b><span className="src-s">Foto do papel ou imagem da planta (JPG, PNG). Clique para escolher.</span>
          </button>
          <div className="src-col">
            <button className="src-b" type="button" onClick={() => set({ map: "sketch", sketchUrl: "" })}><b className="src-t">Descrever em texto</b><span className="src-s">&quot;Galpão 40×60 m, palco no fundo, camarotes nas laterais.&quot;</span></button>
            <div className="src-b tpl"><b className="src-t">Começar de um modelo</b><div className="chips">{["Galpão", "Arena", "Teatro", "Ao ar livre"].map((n) => <button key={n} className="chip2" type="button" onClick={runGen}>{n}</button>)}</div></div>
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
            <button className="b-pri" type="button" onClick={runGen}><Spark size={16} />Gerar mapa 3D</button>
            <button className="b-ghost" type="button" onClick={() => (d.sketchUrl ? file.current?.click() : set({ map: "empty" }))}>{d.sketchUrl ? "Trocar arquivo" : "Voltar"}</button>
          </div>
        </div>
      ) : (
        <div className="m3 m3w">
          <MapStage sectorOf={sectorOf} sel={sel} onPick={setSel} view={view} setView={setView} tag={`Escala aproximada · 40 × 60 m · ${MAP_CAPACITY.toLocaleString("pt-BR")} pessoas`} />
          <div className="m3-side">
            <div className="m3-sh"><b className="m3-t">Áreas encontradas</b><span className="m3-s">Ligue cada área a um setor de ingressos.</span></div>
            {MAP_AREAS.map((a) => {
              const fixed = isFixedArea(a);
              const sec = fixed ? null : sectorOf(a.id);
              return (
                <div key={a.id} className={sel === a.id ? "al sel" : "al"}>
                  <span className="al-sw" style={{ background: isFixedArea(a) ? a.color : sec?.color ?? "#8A8A90" }} aria-hidden="true" />
                  <span className="al-i"><b className="al-n">{isFixedArea(a) ? a.fixed : a.name}</b><span className="al-c">{a.cap ? `${a.cap.toLocaleString("pt-BR")} pessoas` : "Sem venda"}</span></span>
                  {fixed ? <span className="al-fx">Fixo</span> : (
                    <button className="al-sel" type="button" onClick={() => {
                      const ids = d.sectors.map((k) => k.id), cur = ids.indexOf(d.areaMap[a.id]);
                      set({ areaMap: { ...d.areaMap, [a.id]: ids[(cur + 1) % ids.length] } });
                      setSel(a.id);
                    }}>{sec?.name ?? "Sem setor"}<Chevron size={12} /></button>
                  )}
                </div>
              );
            })}
            <div className="m3-a"><button className="b-sec sm" type="button" onClick={runGen}>Gerar de novo</button><button className="b-ghost sm" type="button" onClick={() => set({ map: "empty", sketchUrl: "" })}>Novo rascunho</button></div>
            <p className="m3-note">A IA pode errar medidas. Confira a lotação de cada área com a planta oficial do local antes de publicar.</p>
          </div>
        </div>
      )}
    </div>
  );
}
