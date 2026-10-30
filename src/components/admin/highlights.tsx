"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { setFeaturedList, setHeroArt, setHeroList } from "@/lib/actions/admin";
import type { AdminHighlightEvent } from "@/lib/admin";

type Ev = AdminHighlightEvent;
const HERO_MAX = 8, FEAT_MAX = 12;
const SAMPLE = `<!doctype html>
<html><head><style>
  html,body{margin:0;height:100%;background:#111;color:#fff;font-family:Inter,system-ui,sans-serif}
  .b{height:100%;display:grid;place-items:center;text-align:center;background:linear-gradient(120deg,#111,#2b2b2b)}
  h1{margin:0;font-size:8vw;letter-spacing:-.04em}
  p{margin:1vw 0 0;font-size:2vw;color:#D3F55B}
</style></head>
<body><div class="b"><div><h1>Nome do evento</h1><p>Sáb, 31 out · São Paulo</p></div></div></body></html>`;

/** Banner principal e "Eventos em destaque" da home: escolher, ordenar e definir a arte do banner. */
export function AdminHighlights({ events }: { events: Ev[] }) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const initHero = events.filter((e) => e.heroOrder != null).sort((a, b) => a.heroOrder! - b.heroOrder!).map((e) => e.id);
  const initFeat = events.filter((e) => e.featuredOrder != null).sort((a, b) => a.featuredOrder! - b.featuredOrder!).map((e) => e.id);
  return (
    <>
      <ListCard
        title="Banner principal da home"
        sub={`O carrossel do topo da home, nesta ordem (até ${HERO_MAX}). Cada banner pode usar a arte do evento, uma imagem/GIF enviada aqui ou HTML. Sem nenhum escolhido, a home mostra os próximos eventos.`}
        max={HERO_MAX} initial={initHero} byId={byId} events={events} save={setHeroList} withArt
      />
      <ListCard
        title="Eventos em destaque"
        sub={`Aparecem primeiro na seção "Eventos em destaque" da home, nesta ordem (até ${FEAT_MAX}). Depois deles vêm os outros eventos por data.`}
        max={FEAT_MAX} initial={initFeat} byId={byId} events={events} save={setFeaturedList}
      />
    </>
  );
}

function ListCard({ title, sub, max, initial, byId, events, save, withArt }: {
  title: string; sub: string; max: number; initial: string[]; byId: Map<string, Ev>; events: Ev[];
  save: (ids: string[]) => Promise<{ ok: boolean; error?: string }>; withArt?: boolean;
}) {
  const router = useRouter();
  const [ids, setIds] = useState(initial);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const dirty = ids.join() !== initial.join();
  const rest = events.filter((e) => !ids.includes(e.id));

  const move = (i: number, d: -1 | 1) => setIds((o) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  async function commit() {
    setBusy(true); setMsg(null);
    const r = await save(ids);
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: "Salvo. A home já mostra a nova ordem." } : { ok: false, t: r.error ?? "Não deu certo." });
    if (r.ok) router.refresh();
  }

  return (
    <section className="ad-card hl-card">
      <div className="hl-hd">
        <div><h2>{title}</h2><p>{sub}</p></div>
        <button className="ad-b ok" type="button" disabled={!dirty || busy} onClick={() => void commit()}>{busy ? "Salvando…" : "Salvar ordem"}</button>
      </div>
      {msg && <p className={msg.ok ? "ad-msg" : "ad-warn"}>{msg.t}</p>}
      <ol className="hl-list">
        {ids.map((id, i) => {
          const e = byId.get(id);
          if (!e) return null;
          return (
            <li key={id} className="hl-item">
              <div className="hl-row">
                <span className="hl-n">{i + 1}</span>
                {withArt && <span className="hl-thumb"><Preview e={e} /></span>}
                <span className="hl-t"><b>{e.title}</b><small>{[e.when, e.city, e.producer].filter(Boolean).join(" · ")}</small>
                  {withArt && <small className="hl-kind">{e.heroHtml ? "Arte em HTML" : e.heroArt ? (e.heroArt.endsWith(".gif") ? "GIF enviado" : "Imagem enviada") : "Arte do evento"}</small>}
                </span>
                <span className="hl-acts">
                  {withArt && <button className="ad-b" type="button" onClick={() => setEdit(edit === id ? null : id)} aria-expanded={edit === id}>Arte</button>}
                  <button className="ad-b hl-ic" type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                  <button className="ad-b hl-ic" type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label="Descer">↓</button>
                  <button className="ad-b no hl-ic" type="button" onClick={() => setIds((o) => o.filter((x) => x !== id))} aria-label="Tirar">✕</button>
                </span>
              </div>
              {withArt && edit === id && <ArtEditor e={e} onDone={() => { setEdit(null); router.refresh(); }} />}
            </li>
          );
        })}
        {!ids.length && <li className="ad-empty hl-empty">Nenhum evento escolhido.</li>}
      </ol>
      <div className="hl-add">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Escolher evento">
          <option value="">Escolher evento publicado…</option>
          {rest.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}{e.city ? ` · ${e.city}` : ""}</option>)}
        </select>
        <button className="ad-b" type="button" disabled={!pick || ids.length >= max} onClick={() => { setIds((o) => [...o, pick]); setPick(""); }}>Adicionar</button>
        {ids.length >= max && <small>Limite de {max} eventos.</small>}
      </div>
      {dirty && <p className="hl-note">Você mudou a lista. Toque em <b>Salvar ordem</b> para publicar.</p>}
    </section>
  );
}

/** Miniatura do banner como vai aparecer na home. */
function Preview({ e, html, art }: { e: Ev; html?: string | null; art?: string | null }) {
  const h = html !== undefined ? html : e.heroHtml;
  const a = art !== undefined ? art : e.heroArt;
  if (h) return <iframe title={`Prévia de ${e.title}`} srcDoc={h} sandbox="allow-scripts" className="hl-frame" />;
  return <BannerArt id={a ?? e.bannerId ?? e.flyerId} fit="ratio" poster={!a && (e.bannerId ?? e.flyerId) === e.flyerId} />;
}

function ArtEditor({ e, onDone }: { e: Ev; onDone: () => void }) {
  const [mode, setMode] = useState<"evento" | "imagem" | "html">(e.heroHtml ? "html" : e.heroArt ? "imagem" : "evento");
  const [art, setArt] = useState<string | null>(e.heroArt);
  const [html, setHtml] = useState(e.heroHtml ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type)) { setErr("Envie PNG, JPG, WebP ou GIF."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/admin/banner", { method: "POST", body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (j?.url) setArt(j.url); else setErr(j?.error ?? "Não foi possível enviar o arquivo.");
    if (file.current) file.current.value = "";
  }
  async function save() {
    setBusy(true); setErr(null);
    const r = await setHeroArt(e.id, mode === "imagem" ? art : null, mode === "html" ? html : null);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não deu certo."); return; }
    onDone();
  }

  const previewHtml = mode === "html" ? html || null : null;
  const previewArt = mode === "imagem" ? art : null;
  return (
    <div className="hl-ed">
      <div className="hl-tabs" role="tablist" aria-label="Tipo de arte">
        {([["evento", "Arte do evento"], ["imagem", "Imagem ou GIF"], ["html", "HTML"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "on" : undefined} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>
      {mode === "evento" && <p className="hl-tip">Usa o banner que o produtor colocou no evento (ou o cartaz, se não houver banner).</p>}
      {mode === "imagem" && (
        <div className="hl-up">
          <input ref={file} className="sr" type="file" accept="image/png,image/jpeg,image/webp,image/gif" tabIndex={-1} aria-label="Escolher arquivo" onChange={(ev) => void upload(ev.target.files?.[0])} />
          <button className="ad-b" type="button" onClick={() => file.current?.click()} disabled={busy}>{busy ? "Enviando…" : art ? "Trocar arquivo" : "Enviar PNG, JPG, WebP ou GIF"}</button>
          <small>Tamanho ideal 2520 × 1080 (21:9), até 15 MB. No celular aparece em 16:9, cortando as laterais: deixe o importante no centro.</small>
        </div>
      )}
      {mode === "html" && (
        <div className="hl-html">
          <textarea value={html} onChange={(ev) => setHtml(ev.target.value)} spellCheck={false} rows={12} placeholder="Cole aqui o HTML do banner que o produtor mandou" aria-label="HTML do banner" />
          <div className="hl-html-a">
            {!html && <button className="ad-b" type="button" onClick={() => setHtml(SAMPLE)}>Usar modelo</button>}
            <small>O HTML roda isolado do site (sem acesso a cookies nem à conta). Links dentro dele não funcionam: o clique no banner sempre leva para a página do evento. Imagens precisam estar em endereços https.</small>
          </div>
        </div>
      )}
      <div className="hl-prev">
        <span><small>Computador (21:9)</small><span className="hl-pv w"><Preview e={e} html={previewHtml} art={previewArt} /></span></span>
        <span><small>Celular (16:9)</small><span className="hl-pv m"><Preview e={e} html={previewHtml} art={previewArt} /></span></span>
      </div>
      {err && <p className="ad-warn">{err}</p>}
      <div className="hl-ed-a">
        <button className="ad-b" type="button" onClick={onDone}>Cancelar</button>
        <button className="ad-b ok" type="button" disabled={busy || (mode === "imagem" && !art) || (mode === "html" && !html.trim())} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar arte"}</button>
      </div>
    </div>
  );
}
