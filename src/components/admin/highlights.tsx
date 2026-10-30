"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { HeroStage } from "@/components/home/hero-stage";
import { HtmlArtFrame } from "@/components/art/html-art-frame";
import { deleteHeroSlide, saveHeroSlide, setFeaturedList, setHeroArt, setHeroOrder } from "@/lib/actions/admin";
import type { AdminHeroSlide, AdminHighlightEvent } from "@/lib/admin";

type Ev = AdminHighlightEvent;
type Sl = AdminHeroSlide;
const HERO_MAX = 8, FEAT_MAX = 12;
const SAMPLE = `<!doctype html>
<html><head><style>
  html,body{margin:0;height:100%;background:#111;color:#fff;font-family:Inter,system-ui,sans-serif}
  .b{height:100%;display:grid;place-items:center;text-align:center;background:linear-gradient(120deg,#111,#2b2b2b)}
  h1{margin:0;font-size:8vw;letter-spacing:-.04em}
  p{margin:1vw 0 0;font-size:2vw;color:#EDFF3C}
</style></head>
<body><div class="b"><div><h1>Nome do evento</h1><p>Sáb, 31 out · São Paulo</p></div></div></body></html>`;

/** Banner principal e "Eventos em destaque" da home: escolher, ordenar e definir a arte do banner. */
export function AdminHighlights({ events, slides }: { events: Ev[]; slides: Sl[] }) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const initFeat = events.filter((e) => e.featuredOrder != null).sort((a, b) => a.featuredOrder! - b.featuredOrder!).map((e) => e.id);
  return (
    <>
      <HeroCard events={events} slides={slides} byId={byId} />
      <ListCard
        title="Eventos em destaque"
        sub={`Aparecem primeiro na seção "Eventos em destaque" da home, nesta ordem (até ${FEAT_MAX}). Depois deles vêm os outros eventos por data.`}
        max={FEAT_MAX} initial={initFeat} byId={byId} events={events} save={setFeaturedList}
      />
    </>
  );
}

/* ------------------------- banner principal: eventos + banners livres ------------------------- */

/** Ordem única do carrossel: "e:<id do evento>" e "s:<id do banner livre>". */
function heroTokens(events: Ev[], slides: Sl[]) {
  return [
    ...slides.map((s) => ({ t: `s:${s.id}`, n: s.position, k: 0 })),
    ...events.filter((e) => e.heroOrder != null).map((e) => ({ t: `e:${e.id}`, n: e.heroOrder!, k: 1 })),
  ].sort((a, b) => a.n - b.n || a.k - b.k).map((x) => x.t);
}

function HeroCard({ events, slides, byId }: { events: Ev[]; slides: Sl[]; byId: Map<string, Ev> }) {
  const router = useRouter();
  const slById = new Map(slides.map((x) => [x.id, x]));
  const initial = heroTokens(events, slides);
  const [order, setOrder] = useState(initial);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  // banner livre criado (ou apagado) depois de abrir a página entra (ou sai) sem perder a ordem que está sendo mexida
  const exists = (t: string) => (t.startsWith("s:") ? slById.has(t.slice(2)) : byId.has(t.slice(2)));
  const ids = [...order.filter(exists), ...initial.filter((t) => t.startsWith("s:") && !order.includes(t))];
  const dirty = ids.join() !== initial.join();
  const shown = ids.filter((t) => t.startsWith("e:") || slById.get(t.slice(2))?.active).length;
  const rest = events.filter((e) => !ids.includes(`e:${e.id}`));

  const move = (i: number, d: -1 | 1) => setOrder(() => { const n = [...ids]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  async function commit() {
    setBusy(true); setMsg(null);
    const r = await setHeroOrder(ids);
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: "Salvo. A home já mostra a nova ordem." } : { ok: false, t: r.error ?? "Não deu certo." });
    if (r.ok) router.refresh();
  }
  async function toggle(x: Sl) {
    setBusy(true); setMsg(null);
    const r = await saveHeroSlide({ ...slideInput(x), active: !x.active });
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: x.active ? "Banner desligado: saiu da home." : "Banner ligado: já aparece na home." } : { ok: false, t: r.error ?? "Não deu certo." });
    if (r.ok) router.refresh();
  }
  async function remove(x: Sl) {
    if (!window.confirm(`Apagar o banner "${x.label}"? Para só tirar da home, use Desligar.`)) return;
    setBusy(true); setMsg(null);
    const r = await deleteHeroSlide(x.id);
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: "Banner apagado." } : { ok: false, t: r.error ?? "Não deu certo." });
    if (r.ok) router.refresh();
  }

  return (
    <section className="ad-card hl-card">
      <div className="hl-hd">
        <div>
          <h2>Banner principal da home</h2>
          <p>{`O carrossel do topo da home, nesta ordem (até ${HERO_MAX} aparecendo). Cada evento pode usar a arte dele, uma imagem/GIF enviada aqui ou HTML. Banner livre: uma arte (HTML ou imagem) que leva para qualquer página do site ou endereço https, sem ser evento. Sem nenhum evento escolhido, a home mostra os próximos eventos depois dos banners livres.`}</p>
        </div>
        <button className="ad-b ok" type="button" disabled={!dirty || busy} onClick={() => void commit()}>{busy ? "Salvando…" : "Salvar ordem"}</button>
      </div>
      {msg && <p className={msg.ok ? "ad-msg" : "ad-warn"} role="status">{msg.t}</p>}
      {edit === "novo" && <SlideEditor onDone={(saved) => { setEdit(null); if (saved) { setMsg({ ok: true, t: "Banner criado no fim da lista. Mude a posição e toque em Salvar ordem." }); router.refresh(); } }} />}
      <ol className="hl-list">
        {ids.map((t, i) => {
          const isEv = t.startsWith("e:");
          const e = isEv ? byId.get(t.slice(2)) : undefined;
          const x = isEv ? undefined : slById.get(t.slice(2));
          if (!e && !x) return null;
          const arrows = (
            <>
              <button className="ad-b hl-ic" type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button className="ad-b hl-ic" type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label="Descer">↓</button>
            </>
          );
          return (
            <li key={t} className={x && !x.active ? "hl-item off" : "hl-item"}>
              {e ? (
                <div className="hl-row">
                  <span className="hl-n">{i + 1}</span>
                  <span className="hl-thumb"><Preview e={e} /></span>
                  <span className="hl-t"><b>{e.title}</b><small>{[e.when, e.city, e.producer].filter(Boolean).join(" · ")}</small>
                    <small className="hl-kind">{e.heroHtml ? "Arte em HTML" : e.heroArt ? (e.heroArt.endsWith(".gif") ? "GIF enviado" : "Imagem enviada") : "Arte do evento"}</small>
                  </span>
                  <span className="hl-acts">
                    <button className="ad-b" type="button" onClick={() => setEdit(edit === t ? null : t)} aria-expanded={edit === t}>Arte</button>
                    {arrows}
                    <button className="ad-b no hl-ic" type="button" onClick={() => setOrder(ids.filter((y) => y !== t))} aria-label="Tirar">✕</button>
                  </span>
                </div>
              ) : x && (
                <div className="hl-row">
                  <span className="hl-n">{i + 1}</span>
                  <span className="hl-thumb hl-st"><HeroStage html={x.html} image={x.image} w={x.width} h={x.height} bg={x.bg} active title={`Prévia de ${x.label}`} /></span>
                  <span className="hl-t"><b>{x.label}</b><small>{x.href} · {x.width} × {x.height}</small>
                    <span className="hl-kinds">
                      <small className="hl-kind lv">Banner livre · {x.html ? "HTML" : "imagem"}</small>
                      {!x.active && <small className="hl-kind">Desligado</small>}
                    </span>
                  </span>
                  <span className="hl-acts">
                    <button className="ad-b" type="button" onClick={() => setEdit(edit === t ? null : t)} aria-expanded={edit === t}>Editar</button>
                    <button className="ad-b" type="button" disabled={busy} onClick={() => void toggle(x)}>{x.active ? "Desligar" : "Ligar"}</button>
                    {arrows}
                    <button className="ad-b no hl-ic" type="button" disabled={busy} onClick={() => void remove(x)} aria-label={`Apagar o banner ${x.label}`}>✕</button>
                  </span>
                </div>
              )}
              {e && edit === t && <ArtEditor e={e} onDone={() => { setEdit(null); router.refresh(); }} />}
              {x && edit === t && <SlideEditor slide={x} onDone={(saved) => { setEdit(null); if (saved) router.refresh(); }} />}
            </li>
          );
        })}
        {!ids.length && <li className="ad-empty hl-empty">Nenhum banner escolhido.</li>}
      </ol>
      <div className="hl-add">
        <select value={pick} onChange={(ev) => setPick(ev.target.value)} aria-label="Escolher evento">
          <option value="">Escolher evento publicado…</option>
          {rest.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}{e.city ? ` · ${e.city}` : ""}</option>)}
        </select>
        <button className="ad-b" type="button" disabled={!pick || shown >= HERO_MAX} onClick={() => { setOrder([...ids, `e:${pick}`]); setPick(""); }}>Adicionar evento</button>
        <button className="ad-b" type="button" disabled={edit === "novo"} onClick={() => setEdit("novo")}>Novo banner livre</button>
        {shown >= HERO_MAX && <small>Limite de {HERO_MAX} banners aparecendo.</small>}
      </div>
      {dirty && <p className="hl-note">Você mudou a lista. Toque em <b>Salvar ordem</b> para publicar.</p>}
    </section>
  );
}

const slideInput = (x: Sl) => ({
  id: x.id, label: x.label, href: x.href, cta: x.cta ?? "", kind: x.html ? "html" as const : "image" as const, html: x.html ?? "", image: x.image,
  width: x.width, height: x.height, bg: x.bg, active: x.active,
});

/** Criar ou editar um banner livre: arte (HTML ou imagem), link, rótulo, tamanho de projeto, fundo, ligado. */
function SlideEditor({ slide, onDone }: { slide?: Sl; onDone: (saved: boolean) => void }) {
  const [f, setF] = useState(() => slide ? slideInput(slide) : {
    id: null as string | null, label: "", href: "", cta: "", kind: "html" as "html" | "image", html: "", image: null as string | null,
    width: 1440, height: 800, bg: "#111111", active: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
  const w = Math.min(3840, Math.max(320, Math.round(Number(f.width)) || 1440));
  const h = Math.min(2160, Math.max(180, Math.round(Number(f.height)) || 800));
  const bg = /^#[0-9a-f]{6}$/i.test(f.bg) ? f.bg : "#111111";

  async function upload(file0: File | undefined) {
    if (!file0) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file0.type)) { setErr("Envie PNG, JPG, WebP ou GIF."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.append("file", file0);
    const r = await fetch("/api/admin/banner", { method: "POST", body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
    setBusy(false);
    if (j?.url) set("image", j.url); else setErr(j?.error ?? "Não foi possível enviar o arquivo.");
    if (file.current) file.current.value = "";
  }
  async function save() {
    setBusy(true); setErr(null);
    const r = await saveHeroSlide(f);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não deu certo."); return; }
    onDone(true);
  }

  const hasArt = f.kind === "html" ? !!f.html.trim() : !!f.image;
  const art = { html: f.kind === "html" ? f.html.trim() || null : null, image: f.kind === "image" ? f.image : null };
  return (
    <div className={slide ? "hl-ed" : "hl-ed hl-new"}>
      {!slide && <h3 className="hl-ed-t">Novo banner livre</h3>}
      <div className="hl-fs">
        <label>Rótulo<input value={f.label} onChange={(ev) => set("label", ev.target.value)} maxLength={160} placeholder="Ex.: Produtor, seu evento começa aqui" />
          <small>O leitor de tela lê no link; no celular aparece embaixo da arte.</small></label>
        <label>Link de destino<input value={f.href} onChange={(ev) => set("href", ev.target.value)} maxLength={500} placeholder="/produtores ou https://…" inputMode="url" spellCheck={false} />
          <small>Página do site (começando com /) ou endereço https://.</small></label>
        <label>Texto do botão no celular (opcional)<input value={f.cta} onChange={(ev) => set("cta", ev.target.value)} maxLength={40} placeholder="Ex.: Crie seu evento" /></label>
      </div>
      <div className="hl-tabs" role="tablist" aria-label="Tipo de arte">
        {([["html", "HTML"], ["image", "Imagem ou GIF"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={f.kind === k} className={f.kind === k ? "on" : undefined} onClick={() => set("kind", k)}>{l}</button>
        ))}
      </div>
      {f.kind === "html" ? (
        <div className="hl-html">
          <textarea value={f.html} onChange={(ev) => set("html", ev.target.value)} spellCheck={false} rows={10} placeholder="Cole aqui o HTML do banner" aria-label="HTML do banner" />
          <small>Até 300 KB. Roda isolado do site (sem cookies, sem a conta); links e botões dentro dele não funcionam: o clique no banner leva para o link de destino.</small>
        </div>
      ) : (
        <div className="hl-up">
          <input ref={file} className="sr" type="file" accept="image/png,image/jpeg,image/webp,image/gif" tabIndex={-1} aria-label="Escolher arquivo" onChange={(ev) => void upload(ev.target.files?.[0])} />
          <button className="ad-b" type="button" onClick={() => file.current?.click()} disabled={busy}>{busy ? "Enviando…" : f.image ? "Trocar arquivo" : "Enviar PNG, JPG, WebP ou GIF"}</button>
          <small>Até 15 MB, no tamanho de projeto abaixo.</small>
        </div>
      )}
      <div className="hl-fs hl-fs3">
        <label>Largura de projeto (px)<input type="number" min={320} max={3840} value={f.width} onChange={(ev) => set("width", Number(ev.target.value))} /></label>
        <label>Altura de projeto (px)<input type="number" min={180} max={2160} value={f.height} onChange={(ev) => set("height", Number(ev.target.value))} /></label>
        <label>Cor de fundo<span className="hl-color"><input type="color" value={bg} onChange={(ev) => set("bg", ev.target.value.toUpperCase())} aria-label="Escolher a cor de fundo" /><input value={f.bg} onChange={(ev) => set("bg", ev.target.value)} maxLength={7} spellCheck={false} aria-label="Cor de fundo em #RRGGBB" /></span></label>
      </div>
      <small className="hl-tip">A arte é desenhada nesse tamanho e escalada para caber: no computador ocupa a largura toda; no celular aparece inteira no cartão 16:9. A cor de fundo preenche as sobras.</small>
      <label className="hl-chk"><input type="checkbox" checked={f.active} onChange={(ev) => set("active", ev.target.checked)} /> Ligado (aparece na home)</label>
      {hasArt && (
        <div className="hl-prev">
          <span><small>Computador</small><span className="hl-pv d hl-st"><HeroStage {...art} w={w} h={h} bg={bg} active title="Prévia no computador" /></span></span>
          <span><small>Celular (16:9)</small><span className="hl-pv m hl-st"><HeroStage {...art} w={w} h={h} bg={bg} active title="Prévia no celular" /></span></span>
        </div>
      )}
      {err && <p className="ad-warn" role="alert">{err}</p>}
      <div className="hl-ed-a">
        <button className="ad-b" type="button" onClick={() => onDone(false)}>Cancelar</button>
        <button className="ad-b ok" type="button" disabled={busy || !hasArt} onClick={() => void save()}>{busy ? "Salvando…" : slide ? "Salvar banner" : "Criar banner"}</button>
      </div>
    </div>
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
  if (h) return <HtmlArtFrame title={`Prévia de ${e.title}`} html={h} className="hl-frame" />;
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
