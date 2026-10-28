"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { eventInfos, findEvents } from "@/lib/actions/emails";
import { BLOCK_INFO, type Block, type MailStyle } from "@/lib/mail/design";
import { onColor, type EvInfo, type OrgInfo } from "@/lib/mail/render";
import type { CouponOpt, EditorData, EvOpt } from "./campaign";

type Up = (patch: Partial<Block>, key?: string) => void;

/** Envia a imagem para o armazenamento do site e devolve o endereço (/midia/...). */
async function upload(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/midia", { method: "POST", body: fd });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? "Não foi possível enviar a imagem.");
  return j.url;
}

function ImagePick({ value, onChange, label = "Imagem", hint }: { value: string; onChange: (v: string) => void; label?: string; hint?: string }) {
  const { flash } = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="fld">
      <span>{label}</span>
      {value ? (
        <div className="ep-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" />
          <div className="ep-ia"><button className="b2 sm2" type="button" onClick={() => input.current?.click()} disabled={busy}>Trocar</button><button className="b2 sm2" type="button" onClick={() => onChange("")}>Remover</button></div>
        </div>
      ) : (
        <button className="ep-drop" type="button" onClick={() => input.current?.click()} disabled={busy}
          onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; setBusy(true); try { onChange(await upload(f)); } catch (x) { flash((x as Error).message); } setBusy(false); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 16l4-4 4 4 3-3 5 5M4 4h16v16H4zM15 9h.01" /></svg>
          {busy ? "Enviando…" : "Enviar imagem (JPG, PNG ou WebP)"}
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); try { onChange(await upload(f)); } catch (x) { flash((x as Error).message); } setBusy(false); }} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Escolha do evento: os seus (próximos e passados) ou um evento parceiro, pela busca. */
function EventPick({ value, onChange, events, data, onEvents, label = "Evento" }: { value: string; onChange: (id: string) => void; events: EvOpt[]; data: EditorData; onEvents: (e: Record<string, EvInfo>) => void; label?: string }) {
  const { flash } = useToast();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; title: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const own = new Set(events.map((e) => e.id));
  const partner = value && !own.has(value) ? data.events[value] : null;
  const search = async () => {
    setSearching(true);
    const r = await findEvents(q);
    setSearching(false);
    if (!r.ok) { flash(r.error); return; }
    setRes(r.list.filter((x) => !own.has(x.id)));
  };
  const pick = async (id: string) => {
    const r = await eventInfos([id]);
    if (!r.ok) { flash(r.error); return; }
    onEvents(r.events); onChange(id); setRes(null); setQ("");
  };
  const up = events.filter((e) => !e.past), past = events.filter((e) => e.past);
  return (
    <div className="ep-ev">
      <label className="fld"><span>{label}</span>
        <select value={own.has(value) ? value : value ? "__p" : ""} onChange={(e) => { if (e.target.value !== "__p") onChange(e.target.value); }}>
          <option value="">Escolha o evento</option>
          {up.length > 0 && <optgroup label="Próximos">{up.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}</option>)}</optgroup>}
          {past.length > 0 && <optgroup label="Já aconteceram">{past.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}</option>)}</optgroup>}
          {partner && <option value="__p">{partner.title} (parceiro)</option>}
        </select>
      </label>
      <details className="ep-pt">
        <summary>Evento de outro produtor</summary>
        <form className="ep-ps" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome do evento" aria-label="Buscar evento parceiro" />
          <button className="b2 sm2" type="submit" disabled={q.trim().length < 2 || searching}>{searching ? "…" : "Buscar"}</button>
        </form>
        {res && (res.length ? <div className="ep-pr">{res.map((x) => <button key={x.id} type="button" onClick={() => void pick(x.id)}>{x.title}</button>)}</div> : <small className="mc-hint">Nenhum evento publicado com esse nome.</small>)}
      </details>
    </div>
  );
}

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div className="fld"><span>{label}</span><div className="seg2 sm">{options.map(([k, l]) => <button key={k} className={value === k ? "sg on" : "sg"} type="button" onClick={() => onChange(k)}>{l}</button>)}</div></div>
);
const Toggle = ({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub?: string }) => (
  <label className="tg2"><span><b>{title}</b>{sub && <small>{sub}</small>}</span><input className="sr" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="sw" aria-hidden="true" /></label>
);

/** Destinos prontos do botão: páginas dos eventos e atalhos do site. */
function LinkPick({ value, onChange, events }: { value: string; onChange: (v: string) => void; events: EvOpt[]; data: EditorData }) {
  const opts: [string, string][] = [
    ...events.filter((e) => !e.past).map((e): [string, string] => [`evento:${e.id}`, `Página de ${e.title}`]),
    ["/meus-ingressos", "Meus ingressos"],
  ];
  return (
    <div className="fld"><span>Link do botão</span>
      <select value={opts.some(([k]) => k === value) ? value : "custom"} onChange={(e) => onChange(e.target.value === "custom" ? "https://" : e.target.value)}>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        <option value="custom">Outro endereço…</option>
      </select>
      {!opts.some(([k]) => k === value) && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://" />}
    </div>
  );
}

/** Formulário do bloco selecionado. */
export function BlockProps({ b, update, events, data, coupons, onEvents, onRemove, onDuplicate }: { b: Block; update: Up; events: EvOpt[]; data: EditorData; coupons: CouponOpt[]; onEvents: (e: Record<string, EvInfo>) => void; onRemove: () => void; onDuplicate: () => void }) {
  const ev = (label?: string) => "eventId" in b ? <EventPick label={label} value={b.eventId} onChange={(id) => update({ eventId: id } as Partial<Block>)} events={events} data={data} onEvents={onEvents} /> : null;
  const txt = (k: string, label: string, ph = "", hint?: string) => (
    <label className="fld"><span>{label}</span><input value={(b as Record<string, unknown>)[k] as string} placeholder={ph} onChange={(e) => update({ [k]: e.target.value } as Partial<Block>, `${b.id}:${k}`)} />{hint && <small>{hint}</small>}</label>
  );
  let body: React.ReactNode = null;
  switch (b.t) {
    case "titulo":
      body = <>{txt("text", "Texto do título")}<Seg label="Tamanho" value={b.size} options={[["g", "Grande"], ["m", "Médio"], ["p", "Pequeno"]]} onChange={(v) => update({ size: v })} /><Seg label="Alinhamento" value={b.align} options={[["left", "Esquerda"], ["center", "Centro"]]} onChange={(v) => update({ align: v })} /></>;
      break;
    case "texto":
      body = <><p className="ep-hint">Clique no texto dentro do e-mail para escrever. Selecione um trecho para negrito, itálico ou link.</p><Seg label="Alinhamento" value={b.align} options={[["left", "Esquerda"], ["center", "Centro"]]} onChange={(v) => update({ align: v })} /></>;
      break;
    case "imagem":
      body = <><ImagePick value={b.src} onChange={(v) => update({ src: v })} hint="Fotos do evento, o cartaz ou um aviso. Até 10 MB." />{txt("alt", "Descrição da imagem", "Ex.: público na pista", "Aparece quando o e-mail bloqueia imagens.")}{txt("href", "Link ao clicar (opcional)", "https://")}
        <label className="fld"><span>Largura: {b.width}%</span><input type="range" min={30} max={100} step={5} value={b.width} onChange={(e) => update({ width: Number(e.target.value) }, `${b.id}:w`)} /></label>
        <Toggle title="Cantos arredondados" checked={b.rounded} onChange={(v) => update({ rounded: v })} /></>;
      break;
    case "botao":
      body = <>{txt("label", "Texto do botão")}<LinkPick value={b.href} onChange={(v) => update({ href: v })} events={events} data={data} /><Seg label="Alinhamento" value={b.align} options={[["left", "Esquerda"], ["center", "Centro"]]} onChange={(v) => update({ align: v })} /><Toggle title="Largura total" checked={b.full} onChange={(v) => update({ full: v })} /></>;
      break;
    case "evento":
      body = <>{ev()}<Seg label="Formato" value={b.layout} options={[["destaque", "Imagem grande"], ["lado", "Cartaz ao lado"]]} onChange={(v) => update({ layout: v })} /><Toggle title="Mostrar o preço" sub="“A partir de”, pelo lote mais barato à venda" checked={b.price} onChange={(v) => update({ price: v })} />{txt("cta", "Texto do botão", "Comprar ingressos", "Deixe vazio para não mostrar o botão.")}
        <ImagePick label="Imagem própria (opcional)" value={b.image} onChange={(v) => update({ image: v })} hint="Sem imagem própria, usa o banner ou o cartaz do evento." /></>;
      break;
    case "eventos":
      body = <>{txt("title", "Título", "Próximos eventos")}<Seg label="Quais eventos" value={b.mode} options={[["proximos", "Próximos (automático)"], ["escolhidos", "Escolher"]]} onChange={(v) => update({ mode: v })} />
        {b.mode === "proximos" ? <p className="ep-hint">Mostra os seus próximos eventos publicados no momento do envio.</p> : (
          <div className="mc-chips">{events.filter((e) => !e.past).map((e) => <button key={e.id} type="button" className={b.eventIds.includes(e.id) ? "mc-chip on" : "mc-chip"} onClick={() => update({ eventIds: b.eventIds.includes(e.id) ? b.eventIds.filter((x) => x !== e.id) : [...b.eventIds, e.id] })}>{e.title}<small>{e.when}</small></button>)}</div>
        )}
        <Seg label="Quantos no máximo" value={String(b.limit) as "2" | "4" | "6"} options={[["2", "2"], ["4", "4"], ["6", "6"]]} onChange={(v) => update({ limit: Number(v) })} /></>;
      break;
    case "lineup":
      body = <>{ev()}{txt("title", "Título", "Line-up")}<p className="ep-hint">Os artistas e as fotos vêm do cadastro do evento.</p></>;
      break;
    case "ingressos":
      body = <>{ev()}{txt("title", "Título", "Ingressos")}{txt("cta", "Texto do botão", "Garantir o meu")}<p className="ep-hint">Preços e lotes esgotados atualizam no momento do envio.</p></>;
      break;
    case "cupom":
      body = <>
        {coupons.length > 0 && (
          <label className="fld"><span>Seus cupons ativos</span>
            <select value="" onChange={(e) => { const c = coupons.find((x) => x.code === e.target.value); if (c) update({ code: c.code, eventId: c.eventId }); }}>
              <option value="">Usar um cupom que já existe…</option>
              {coupons.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
            </select>
          </label>
        )}
        {txt("code", "Código", "VIP20", "Crie cupons em Marketing. O código precisa existir para funcionar no checkout.")}
        {txt("text", "Texto", "Use o cupom na compra e ganhe desconto.")}{txt("until", "Validade (opcional)", "domingo, 23h59")}
        {ev("Evento do botão “Usar o cupom”")}</>;
      break;
    case "contagem":
      body = <>{ev()}{txt("text", "Texto depois do número", "para {{evento}}", "{{evento}} vira o nome do evento. O número é calculado no dia do envio.")}</>;
      break;
    case "local":
      body = <>{ev()}<p className="ep-hint">Nome do local, endereço e o link “Como chegar” no Google Maps.</p></>;
      break;
    case "espaco":
      body = <label className="fld"><span>Altura: {b.h}px</span><input type="range" min={8} max={80} step={4} value={b.h} onChange={(e) => update({ h: Number(e.target.value) }, `${b.id}:h`)} /></label>;
      break;
    case "redes":
      body = <>{txt("instagram", "Instagram", data.org.instagram || "@suaprodutora")}{txt("whatsapp", "WhatsApp", data.org.whatsapp || "(11) 99999-9999")}{txt("site", "Site", data.org.site || "https://")}<p className="ep-hint">Vazio usa o que está na sua página de produtor.</p></>;
      break;
    case "divisor":
      body = <p className="ep-hint">Uma linha fina para separar partes do e-mail.</p>;
      break;
  }
  return (
    <div className="ep">
      <div className="ep-h"><b>{BLOCK_INFO[b.t].label}</b><div><button className="b2 sm2" type="button" onClick={onDuplicate}>Duplicar</button><button className="b2 sm2 dg" type="button" onClick={onRemove}>Excluir</button></div></div>
      <div className="frm">{body}</div>
    </div>
  );
}

/* ---------- estilo ---------- */

const PRESETS: { name: string; s: Partial<MailStyle> }[] = [
  { name: "Tickets Win", s: { bg: "#F1F1EC", card: "#FFFFFF", text: "#141414", accent: "#141414", accentText: "#DCF568", headerBg: "#FFFFFF", headerText: "#141414", font: "sans" } },
  { name: "Noite", s: { bg: "#0A0A0B", card: "#141416", text: "#F4F4F2", accent: "#DCF568", accentText: "#141414", headerBg: "#141416", headerText: "#F4F4F2", font: "sans" } },
  { name: "Festival", s: { bg: "#FBE7F1", card: "#FFFFFF", text: "#1D1528", accent: "#E5197A", accentText: "#FFFFFF", headerBg: "#1D1528", headerText: "#FFFFFF", font: "sans" } },
  { name: "Editorial", s: { bg: "#ECE8DF", card: "#FBF9F4", text: "#1E1B16", accent: "#1E1B16", accentText: "#FBF9F4", headerBg: "#FBF9F4", headerText: "#1E1B16", font: "serif" } },
  { name: "Limpo", s: { bg: "#F2F4F7", card: "#FFFFFF", text: "#101828", accent: "#2E62F5", accentText: "#FFFFFF", headerBg: "#FFFFFF", headerText: "#101828", font: "sans" } },
];

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ep-col"><input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} /><span>{label}</span><code>{value}</code></label>
  );
}

export function StylePanel({ s, set, accent, org }: { s: MailStyle; set: (patch: Partial<MailStyle>, key?: string) => void; accent?: string; org: OrgInfo }) {
  const presets = accent && accent !== "#111111" ? [...PRESETS, { name: "Cor do evento", s: { bg: "#F4F4EF", card: "#FFFFFF", text: "#1C1C1A", accent, accentText: onColor(accent), headerBg: accent, headerText: onColor(accent) } }] : PRESETS;
  return (
    <div className="ep">
      <div className="fld"><span>Paletas prontas</span>
        <div className="ep-pal">
          {presets.map((p) => (
            <button key={p.name} type="button" className="ep-pp" onClick={() => set(p.s)}>
              <span className="ep-sw" style={{ background: p.s.bg }}><span className="ep-swc" style={{ background: p.s.card }}><i style={{ background: p.s.text }} /><i style={{ background: p.s.text, opacity: .3 }} /><em style={{ background: p.s.accent }} /></span></span>{p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="fld"><span>Topo do e-mail</span>
        <div className="seg2 sm">{([["logo", org.logo ? "Foto + nome" : "Nome"], ["nome", "Só o nome"], ["nenhum", "Sem topo"]] as const).map(([k, l]) => <button key={k} className={s.header === k ? "sg on" : "sg"} type="button" onClick={() => set({ header: k })}>{l}</button>)}</div>
        {!org.logo && <small>Coloque uma foto na sua página de produtor para ela aparecer aqui.</small>}
      </div>
      <div className="ep-cols">
        <Color label="Fundo de fora" value={s.bg} onChange={(v) => set({ bg: v }, "bg")} />
        <Color label="Fundo do e-mail" value={s.card} onChange={(v) => set({ card: v }, "card")} />
        <Color label="Texto" value={s.text} onChange={(v) => set({ text: v }, "text")} />
        <Color label="Botões e destaques" value={s.accent} onChange={(v) => set({ accent: v }, "accent")} />
        <Color label="Texto dos botões" value={s.accentText} onChange={(v) => set({ accentText: v }, "accentText")} />
        {s.header !== "nenhum" && <><Color label="Fundo do topo" value={s.headerBg} onChange={(v) => set({ headerBg: v }, "headerBg")} /><Color label="Texto do topo" value={s.headerText} onChange={(v) => set({ headerText: v }, "headerText")} /></>}
      </div>
      <Seg label="Letra" value={s.font} options={[["sans", "Moderna"], ["serif", "Clássica"], ["mono", "Máquina"]]} onChange={(v) => set({ font: v })} />
      <label className="fld"><span>Cantos: {s.radius}px</span><input type="range" min={0} max={28} step={2} value={s.radius} onChange={(e) => set({ radius: Number(e.target.value) }, "radius")} /></label>
    </div>
  );
}
