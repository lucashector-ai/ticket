"use client";

import { useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import {
  effTypes, joinBr, KIND_LABEL, limitOf, MAX_LIMIT, MEIA_DESC, num, PALETTE, splitBr, toCents,
  type DraftSector, type DraftType, type MediaKey, type Teaser, type TypeKind, type Visibility,
} from "@/lib/criar/model";
import type { Derived } from "./flow";
import { MapaPane } from "./mapa";
import { brMoney, MO, parseIso, shortMoney, Spark, uploadImage, WD, type Ctx } from "./shared";
import { Ico, StepHead, Toggle } from "./steps";

/* =========================== 5. MAPA =========================== */
const DEFAULT_SECTORS: [string, string][] = [["Pista", "#7DA2FF"], ["Pista Premium", "#D3F55B"], ["Camarote", "#FF8AD8"]];

export function MapaStep({ c }: { c: Ctx }) {
  const { d, upd } = c;
  const pick = (mapa: boolean) => upd((o) => {
    if (!mapa) {
      // volta para sem mapa: tira os setores automáticos que o produtor ainda não preencheu
      const kept = o.sectors.filter((k, i) => i === 0 || k.types.some((t) => t.free || num(t.price) > 0));
      return { ...o, tmode: "simples", sectors: kept.length === 1 ? [{ ...kept[0], name: "Ingressos", open: true }] : kept };
    }
    // com mapa, cada área do local vira um setor de ingressos: começa com os setores mais comuns
    const lone = o.sectors.length === 1 && o.sectors[0].name === "Ingressos";
    const sectors = lone ? DEFAULT_SECTORS.map(([name, color], i): DraftSector => ({
      id: `k${i + 1}`, name, color, open: i === 0,
      types: i === 0 ? o.sectors[0].types : [{ id: `t${i + 1}${Date.now().toString(36)}`, kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }],
    })) : o.sectors;
    return { ...o, tmode: "mapa", sectors };
  }, "map");
  const opts = [
    { on: d.tmode !== "mapa", t: "Sem mapa", s: "Pista livre ou ingressos por tipo. O mais simples.", icon: "M4 7h16M4 12h16M4 17h10", act: () => pick(false) },
    { on: d.tmode === "mapa", t: "Mapa 3D do local", s: "Envie um rascunho à mão ou descreva o espaço: a IA monta o 3D com os setores.", icon: "M12 2c.6 5 2.9 7.4 8 8-5.1.6-7.4 3-8 8-.6-5-2.9-7.4-8-8 5.1-.6 7.4-3 8-8z", act: () => pick(true), nw: true },
  ];
  return (
    <section className="cv-st cv-wide">
      <StepHead n={5} k="mapa do local" q="O público escolhe onde ficar?" s="Com mapa, cada setor vira um ingresso e o comprador vê, em 3D, de onde vai assistir." />
      <div className="cv-b cv-mo2">
        {opts.map((m) => (
          <button key={m.t} className={m.on ? "mo on" : "mo"} type="button" onClick={m.act} aria-pressed={m.on}>
            <span className="ic"><Ico d={m.icon} /></span>
            {m.nw && <span className="nw">Com IA</span>}
            <b>{m.t}</b><span className="s">{m.s}</span>
          </button>
        ))}
      </div>
      {d.tmode === "mapa" && <div className="cv-mapa cv-noenter"><MapaPane c={c} bare /></div>}
    </section>
  );
}

/* =========================== 6. INGRESSOS =========================== */
const ADD_TYPES: { kind: TypeKind; label: string; name: string; desc: string; free?: boolean; limit: string }[] = [
  { kind: "inteira", label: "Inteira", name: "Inteira", desc: "", limit: "6" },
  { kind: "meia", label: "Meia-entrada", name: "Meia-entrada", desc: MEIA_DESC, limit: "6" },
  { kind: "social", label: "Meia social", name: "Meia social", desc: "Leve 1 kg de alimento não perecível. Doado a uma instituição parceira.", limit: "4" },
  { kind: "outro", label: "Gratuito", name: "Ingresso gratuito", desc: "", free: true, limit: "2" },
  { kind: "outro", label: "Tipo próprio", name: "Novo tipo", desc: "", limit: "4" },
];
const MAP_SECTORS = ["Pista", "Pista Premium", "Camarote", "Área VIP", "Arquibancada", "Cadeira numerada"];
const TAG: Record<TypeKind, string> = { inteira: "tag int", meia: "tag meia", social: "tag soc", outro: "tag own" };
const money = (v: number) => String(Math.round(Math.max(0, v) * 100) / 100).replace(".", ",");

function Stepper({ value, onChange, step, prefix, suffix, label, wide }: { value: string; onChange: (v: string) => void; step: number; prefix?: string; suffix?: string; label: string; wide?: boolean }) {
  return (
    <div className={wide ? "cv-pz cv-pzw" : "cv-pz"}>
      <button type="button" onClick={() => onChange(money(num(value) - step))} aria-label={`Diminuir ${label}`}>−</button>
      <label>{prefix && <small>{prefix}</small>}<input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d,]/g, ""))} placeholder="0" aria-label={label} />{suffix && <small>{suffix}</small>}</label>
      <button type="button" onClick={() => onChange(money(num(value) + step))} aria-label={`Aumentar ${label}`}>+</button>
    </div>
  );
}

function SectorCard({ c, k, i, many }: { c: Ctx; k: DraftSector; i: number; many: boolean }) {
  const { d, upd } = c;
  const setSector = (fn: (z: DraftSector) => DraftSector) => upd((o) => ({ ...o, sectors: o.sectors.map((z) => (z.id === k.id ? fn(z) : z)) }), "tk");
  const setType = (tid: string, patch: Partial<DraftType>) => setSector((z) => ({ ...z, types: z.types.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));
  const types = effTypes(k, d.autoMeia);
  let cap = 0, inteira = 0;
  for (const t of types) { cap += num(t.qty); if (t.kind === "inteira" && !t.free) inteira = num(t.price); }
  const ro = () => c.flash("Esta meia é gerada da Inteira. Desligue a meia automática para editar.");
  const nextColor = () => setSector((z) => ({ ...z, color: PALETTE[(PALETTE.indexOf(z.color) + 1) % PALETTE.length] }));
  return (
    <div className="cv-sec" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="h">
        <button className="cv-dot" type="button" style={{ background: k.color }} onClick={nextColor} aria-label="Trocar a cor do setor" title="Trocar a cor" />
        {many ? <input className="nm" value={k.name} maxLength={80} onChange={(e) => setSector((z) => ({ ...z, name: e.target.value }))} aria-label="Nome do setor" /> : <b className="nm">Ingressos</b>}
        <span className="s">{types.length} {types.length === 1 ? "tipo" : "tipos"} · {cap.toLocaleString("pt-BR")} lugares</span>
        {many && d.sectors.length > 1 && <button className="cv-rm" type="button" onClick={() => upd((o) => ({ ...o, sectors: o.sectors.filter((z) => z.id !== k.id) }), "tk")} aria-label={`Remover ${k.name}`}>×</button>}
        <button className={k.open ? "cv-chev o" : "cv-chev"} type="button" onClick={() => setSector((z) => ({ ...z, open: !z.open }))} aria-expanded={k.open} aria-label={`Abrir ${k.name}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></button>
      </div>
      {k.open && (
        <div className="b">
          {types.map((t) => {
            const lim = limitOf(t);
            return (
              <div key={t.id} className={t.auto ? "cv-ty auto" : "cv-ty"}>
                <div className="r1">
                  <span className={TAG[t.kind]}>{t.free ? "GRÁTIS" : KIND_LABEL[t.kind].toUpperCase()}</span>
                  <input className="tn" value={t.name} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { name: e.target.value })} aria-label="Nome do tipo" />
                  {t.free
                    ? <button className="cv-free" type="button" onClick={() => setType(t.id, { free: false })} title="Clique para cobrar">Grátis</button>
                    : t.auto ? <span className="cv-pz ro" onClick={ro}><label><small>R$</small><b>{num(t.price).toLocaleString("pt-BR", { minimumFractionDigits: num(t.price) % 1 ? 2 : 0, maximumFractionDigits: 2 })}</b></label></span>
                      : <Stepper value={t.price} onChange={(v) => setType(t.id, { price: v })} step={5} prefix="R$" label={`preço de ${t.name}`} wide />}
                  {t.auto ? <span className="cv-pz ro" onClick={ro}><label><b>{t.qty}</b><small>un.</small></label></span>
                    : <Stepper value={t.qty} onChange={(v) => setType(t.id, { qty: v.replace(/\D/g, "") })} step={50} suffix="un." label={`quantidade de ${t.name}`} />}
                  <button className="cv-rm" type="button" onClick={t.auto ? ro : () => setSector((z) => ({ ...z, types: z.types.filter((u) => u.id !== t.id) }))} aria-label={`Remover ${t.name}`}>×</button>
                </div>
                <div className="r2">
                  <input className="ds" value={t.desc} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { desc: e.target.value })} placeholder="Descrição (opcional): quem pode comprar, o que inclui" aria-label={`Descrição de ${t.name}`} />
                  {!t.auto && <button className={t.free ? "cv-mini on" : "cv-mini"} type="button" role="switch" aria-checked={!!t.free} onClick={() => setType(t.id, { free: !t.free })}><span className="sw" aria-hidden="true" />Grátis</button>}
                  <span className="cv-lim">Limite por pessoa
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.max(1, lim - 1)) })} disabled={!t.auto && lim <= 1} aria-label={`Diminuir limite de ${t.name}`}>−</button>
                    <b>{lim}</b>
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.min(MAX_LIMIT, lim + 1)) })} disabled={!t.auto && lim >= MAX_LIMIT} aria-label={`Aumentar limite de ${t.name}`}>+</button>
                  </span>
                </div>
                {t.kind === "social" && inteira > 0 && !t.free && <span className="cv-sug"><Spark size={12} />Sugestão: {brMoney(Math.round(inteira * 0.6))}, entre a meia e a inteira</span>}
              </div>
            );
          })}
          <div className="add">
            {ADD_TYPES.filter((a) => a.kind === "outro" || !k.types.some((t) => t.kind === a.kind) || a.kind === "inteira").map((a) => (
              <button key={a.label} className="cv-chip sm" type="button" onClick={() => {
                const price = a.kind === "meia" && inteira ? money(inteira / 2) : a.kind === "social" && inteira ? money(Math.round(inteira * 0.6)) : "";
                setSector((z) => ({ ...z, open: true, types: [...z.types, { id: c.nid("t"), kind: a.kind, name: a.name, price, qty: "100", desc: a.desc, free: a.free, limit: a.limit }] }));
              }}>+ {a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function IngressosStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, set, upd } = c;
  const many = d.tmode === "mapa" || d.sectors.length > 1;
  const [cps, setCps] = useState(d.coupons.length > 0);
  const [rules, setRules] = useState(false);
  const toSingle = () => upd((o) => {
    if (o.sectors.length <= 1) return { ...o, sectors: o.sectors.map((k) => ({ ...k, name: "Ingressos", open: true })) };
    const all = o.sectors.flatMap((k) => k.types.map((t) => ({ ...t, name: `${k.name} · ${t.name}` })));
    return { ...o, sectors: [{ id: "k1", name: "Ingressos", color: "#D3F55B", open: true, types: all }] };
  }, "tk");
  const toSectors = () => upd((o) => (o.sectors.length > 1 ? o : {
    ...o, sectors: [{ ...o.sectors[0], name: o.sectors[0].name === "Ingressos" ? "Pista" : o.sectors[0].name, open: true },
      { id: c.nid("k"), name: "Pista Premium", color: "#D3F55B", open: false, types: [{ id: c.nid("t"), kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }] }],
  }), "tk");
  const addSector = (n: string) => upd((o) => ({
    ...o, sectors: [...o.sectors.map((z) => ({ ...z, open: false })), {
      id: c.nid("k"), name: n, color: PALETTE.find((p) => !o.sectors.some((z) => z.color === p)) ?? PALETTE[o.sectors.length % PALETTE.length], open: true,
      types: [{ id: c.nid("t"), kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }],
    }],
  }), "tk");
  const setCp = (id: string, patch: Partial<(typeof d.coupons)[number]>) => upd((o) => ({ ...o, coupons: o.coupons.map((y) => (y.id === id ? { ...y, ...patch } : y)) }));
  const OPT: [keyof typeof d & ("autoMeia" | "fee" | "transfer" | "resale"), string, string][] = [
    ["autoMeia", "Criar meia-entrada automaticamente", "Todo tipo Inteira ganha uma Meia por 50% do valor (Lei 12.933)."],
    ["fee", "Repassar taxa ao comprador", "O preço aparece com “+ taxas”. Desligado, a taxa de 10% sai do seu repasse."],
    ["transfer", "Permitir transferência", "O fã envia o ingresso para outra pessoa. O QR antigo deixa de valer na hora."],
    ["resale", "Permitir revenda oficial", "Quem não puder ir revende aqui, com preço máximo de 120% e QR novo."],
  ];
  return (
    <section className="cv-st cv-wide cv-noenter">
      <StepHead n={6} k="ingressos" q="Como você quer vender?" s="Cada setor pode ter inteira, meia-entrada (50% por lei), meia social, ingresso grátis ou um tipo seu. Ajuste preço, quantidade e limite por pessoa direto na lista." />
      <div className="cv-b cv-seg big">
        <button className={!many ? "sg on" : "sg"} type="button" onClick={toSingle} disabled={d.tmode === "mapa"} title={d.tmode === "mapa" ? "Com mapa, os ingressos são por setor" : undefined}>Preço único</button>
        <button className={many ? "sg on" : "sg"} type="button" onClick={toSectors}>Por setores</button>
      </div>
      {d.tmode === "mapa" && <p className="cv-note">Com mapa 3D, cada setor aqui é uma área que o público escolhe no mapa.</p>}
      <div className="cv-acc">
        <button className="h" type="button" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          <span className="tx"><b>Regras da venda</b>
            <span className="cv-rch">{OPT.map(([k, t]) => <i key={k} className={d[k] ? "on" : ""}>{{ autoMeia: "Meia automática", fee: d.fee ? "Taxa paga pelo comprador" : "Taxa paga por você", transfer: "Transferência", resale: "Revenda oficial" }[k]}{k !== "fee" && !d[k] ? " desligada" : ""}</i>)}</span>
          </span>
          <span className={rules ? "cv-chev o" : "cv-chev"} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
        </button>
        {rules && (
          <div className="cv-opt4">
            {OPT.map(([k, t, s]) => <Toggle key={k} on={!!d[k]} onClick={() => set({ [k]: !d[k] } as Partial<typeof d>, "tk")} title={t} sub={s} />)}
          </div>
        )}
      </div>
      <div className="cv-secs">
        {d.sectors.map((k, i) => <SectorCard key={k.id} c={c} k={k} i={i} many={many} />)}
        {many && (
          <div className="cv-addsec">
            <span>Adicionar setor:</span>
            {MAP_SECTORS.filter((n) => !d.sectors.some((k) => k.name === n)).slice(0, 4).map((n) => <button key={n} className="cv-chip sm" type="button" onClick={() => addSector(n)}>+ {n}</button>)}
            <button className="cv-chip sm" type="button" onClick={() => addSector("Novo setor")}>+ Outro</button>
          </div>
        )}
      </div>
      <div className="cv-sum">
        <div className="cv-sm"><small>Ingressos à venda{x.sessions.length > 1 ? ` (${x.sessions.length} datas)` : ""}</small><b>{x.totalQty.toLocaleString("pt-BR")}</b></div>
        <div className="cv-sm dk"><small>Se esgotar, você recebe</small><b>{shortMoney(x.net)}</b></div>
      </div>

      <div className="cv-cps">
        <button className="h" type="button" onClick={() => setCps((v) => !v)} aria-expanded={cps}>
          <span className="ic"><Ico d="M3 12V4h8l9 9-8 8zM7.5 9.8a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z" size={18} /></span>
          <span className="tx"><b>Cupons de desconto</b><span className="s">{d.coupons.length ? d.coupons.map((y) => y.code || "sem código").join(" · ") : "Para divulgadores, parceiros ou pré-venda. O comprador digita no checkout."}</span></span>
          <span className={cps ? "cv-chev o" : "cv-chev"} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
        </button>
        {cps && (
          <div className="b">
            {d.coupons.map((cp) => (
              <div key={cp.id} className="cp">
                <input className="code" value={cp.code} maxLength={40} placeholder="CODIGO10" onChange={(e) => setCp(cp.id, { code: e.target.value.toUpperCase().replace(/\s/g, "") })} aria-label="Código do cupom" />
                <div className="cv-seg sm"><button className={cp.kind === "pct" ? "sg on" : "sg"} type="button" onClick={() => setCp(cp.id, { kind: "pct" })}>%</button><button className={cp.kind === "brl" ? "sg on" : "sg"} type="button" onClick={() => setCp(cp.id, { kind: "brl" })}>R$</button></div>
                <label className="f"><span>Desconto</span><input inputMode="decimal" value={cp.value} onChange={(e) => setCp(cp.id, { value: e.target.value.replace(/[^\d,]/g, "") })} /></label>
                <label className="f"><span>Usos</span><input inputMode="numeric" value={cp.limit} onChange={(e) => setCp(cp.id, { limit: e.target.value.replace(/\D/g, "") })} /></label>
                <label className="f"><span>Válido até</span><input value={cp.until} onChange={(e) => setCp(cp.id, { until: e.target.value })} placeholder="dd/mm/aaaa" /></label>
                <select value={cp.scope} onChange={(e) => setCp(cp.id, { scope: e.target.value })} aria-label="Vale para">
                  <option value="all">Todos os ingressos</option>
                  {d.sectors.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <button className="cv-rm" type="button" onClick={() => upd((o) => ({ ...o, coupons: o.coupons.filter((y) => y.id !== cp.id) }))} aria-label={`Remover cupom ${cp.code}`}>×</button>
              </div>
            ))}
            <button className="cv-add" type="button" onClick={() => upd((o) => ({ ...o, coupons: [...o.coupons, { id: c.nid("c"), code: "", kind: "pct", value: "10", limit: "100", until: "", scope: "all" }] }))}>+ Novo cupom</button>
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================== 7. ARTES =========================== */
const MEDIA: { id: MediaKey; title: string; ratio: string; w: number; h: number; req: boolean; where: string; mock: string; poster?: boolean }[] = [
  { id: "poster", title: "Cartaz", ratio: "3 / 4", w: 1080, h: 1440, req: true, where: "Card do evento nas listas, na busca e em Meus ingressos", mock: "cd2", poster: true },
  { id: "banner", title: "Banner", ratio: "16 / 9", w: 1920, h: 1080, req: true, where: "Topo da página do evento e fundo da tela de contagem", mock: "ev" },
  { id: "home", title: "Destaque da home", ratio: "21 / 9", w: 2520, h: 1080, req: false, where: "Carrossel de destaques na home (as laterais são cortadas no celular)", mock: "hm" },
  { id: "strip", title: "Faixa promocional", ratio: "5 / 1", w: 2400, h: 480, req: false, where: "Faixa entre as seções da home e nos e-mails", mock: "st" },
  { id: "share", title: "Compartilhamento", ratio: "1.91 / 1", w: 1200, h: 630, req: false, where: "Prévia do link no WhatsApp e nas redes", mock: "wa" },
];

function ArtCard({ c, m, i }: { c: Ctx; m: (typeof MEDIA)[number]; i: number }) {
  const url = c.d.media[m.id];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const r = await uploadImage(f, { w: m.w, h: m.h, label: m.title });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!r.ok) { c.flash(r.error); return; }
    c.upd((o) => ({ ...o, media: { ...o.media, [m.id]: r.url } }), m.id === "banner" ? "banner" : "art");
    c.flash(`${m.title} enviado`);
  }
  const art = url ? (m.poster ? <FlyerArt id={url} /> : <BannerArt id={url} fit="fill" />) : null;
  return (
    <div className="cv-art" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="i">
        <div className="hh"><b>{m.title}</b><span className={m.req ? "rq" : "rq opt"}>{m.req ? "Obrigatório" : "Opcional"}</span></div>
        <span className="s">{m.ratio.replace(" / ", ":")} · {m.w} × {m.h} px</span>
        <button className={url ? "dz ok" : "dz"} type="button" style={{ aspectRatio: m.ratio, width: m.poster ? "62%" : "100%" }} onClick={() => input.current?.click()} disabled={busy}>
          {url ? <span className="f">{art}</span> : <span className="e"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>{busy ? "Enviando…" : "Enviar arte"}</span>}
        </button>
        <input ref={input} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label={`Arquivo: ${m.title}`} onChange={(e) => void onFile(e.target.files?.[0])} />
        {url && <div className="ac"><button className="cv-lnk" type="button" onClick={() => input.current?.click()}>Trocar arquivo</button><button className="cv-lnk mute" type="button" onClick={() => c.upd((o) => ({ ...o, media: { ...o.media, [m.id]: undefined } }), "art")}>Remover</button></div>}
      </div>
      <div className="use">
        <span className="k">Onde aparece</span><b>{m.where}</b>
        <div className={`cv-mk ${m.mock}`}><span className="bar" /><span className="slot">{art}</span><span className="l1" /><span className="l2" /><span className="l3" /></div>
      </div>
    </div>
  );
}

export function ArtesStep({ c }: { c: Ctx }) {
  const n = MEDIA.filter((m) => c.d.media[m.id]).length;
  return (
    <section className="cv-st cv-wide">
      <StepHead n={7} k="artes" q="Envie as artes do evento" s={`Cada formato aparece num lugar do site, e ao lado você vê exatamente onde. Usamos a imagem como está, sem cortar. ${n} de ${MEDIA.length} enviadas.`} />
      <div className="cv-b cv-arts">{MEDIA.map((m, i) => <ArtCard key={m.id} c={c} m={m} i={i} />)}</div>
    </section>
  );
}

/* =========================== 8. VENDAS =========================== */
const THEMES: { id: Teaser["theme"]; t: string; s: string }[] = [
  { id: "arte", t: "Arte do evento", s: "Banner desfocado no fundo e o cartaz em destaque" },
  { id: "escuro", t: "Preto Tickets Win", s: "Fundo preto com brilho lima" },
  { id: "lima", t: "Lima", s: "Fundo lima com texto preto" },
  { id: "foto", t: "Foto própria", s: "Uma imagem sua no fundo" },
];
const plusDays = (n: number, time = "12:00") => { const t = new Date(Date.now() + n * 864e5); return joinBr(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`, time); };

export function VendasStep({ c }: { c: Ctx }) {
  const { d, set, upd } = c;
  const mode = !d.saleStart.trim() ? "agora" : d.presaleStart.trim() ? "pre" : "data";
  const open = splitBr(d.saleStart), pre = splitBr(d.presaleStart);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const setTeaser = (p: Partial<Teaser>) => upd((o) => ({ ...o, teaser: { ...o.teaser, ...p } }), "sale");
  const pick = (m: "agora" | "data" | "pre") => {
    if (m === "agora") set({ saleStart: "", presaleStart: "" }, "sale");
    else {
      const saleStart = d.saleStart.trim() || plusDays(7);
      const o = splitBr(saleStart);
      const pres = m === "pre" ? (d.presaleStart.trim() || (() => { const t = parseIso(o.date); t.setDate(t.getDate() - 3); return joinBr(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`, o.time || "12:00"); })()) : "";
      set({ saleStart, presaleStart: pres }, "sale");
    }
  };
  async function onImage(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const r = await uploadImage(f);
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!r.ok) { c.flash(r.error); return; }
    setTeaser({ image: r.url, theme: "foto" });
  }
  const CARDS = [
    { id: "agora" as const, t: "Já, ao publicar", s: "Os ingressos ficam à venda assim que o evento for ao ar.", icon: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" },
    { id: "data" as const, t: "Numa data marcada", s: "A página vira uma contagem regressiva em tela cheia até a abertura.", icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" },
    { id: "pre" as const, t: "Pré-venda + venda geral", s: "Quem se cadastra recebe um link secreto para comprar antes de todo mundo.", icon: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" },
  ];
  return (
    <section className="cv-st cv-wide">
      <StepHead n={8} k="abertura das vendas" q="Quando as vendas abrem?" s="Lançamento com hora marcada gera fila de gente esperando. Você monta a tela de contagem do seu jeito." />
      <div className="cv-b cv-mo3">
        {CARDS.map((m) => (
          <button key={m.id} className={mode === m.id ? "mo on" : "mo"} type="button" onClick={() => pick(m.id)} aria-pressed={mode === m.id}>
            <span className="ic"><Ico d={m.icon} /></span><b>{m.t}</b><span className="s">{m.s}</span>
          </button>
        ))}
      </div>
      {mode !== "agora" && (
        <div className="cv-when cv-pop">
          {mode === "pre" && (
            <div className="w">
              <span className="k"><i className="pre" />Pré-venda para cadastrados</span>
              <div className="r">
                <input type="date" value={pre.date} onChange={(e) => set({ presaleStart: joinBr(e.target.value, pre.time || "12:00") }, "sale")} aria-label="Dia da pré-venda" />
                <input type="time" value={pre.time} onChange={(e) => set({ presaleStart: joinBr(pre.date, e.target.value) }, "sale")} aria-label="Hora da pré-venda" />
              </div>
            </div>
          )}
          <div className="w">
            <span className="k"><i />{mode === "pre" ? "Venda geral para todos" : "Abertura das vendas"}</span>
            <div className="r">
              <input type="date" value={open.date} onChange={(e) => set({ saleStart: joinBr(e.target.value, open.time || "12:00") }, "sale")} aria-label="Dia da abertura" />
              <input type="time" value={open.time} onChange={(e) => set({ saleStart: joinBr(open.date, e.target.value) }, "sale")} aria-label="Hora da abertura" />
            </div>
          </div>
          <p className="cv-note" style={{ gridColumn: "1 / -1" }}>Horário de Brasília. {mode === "pre" ? "Os links da pré-venda saem por e-mail na hora em que ela começa; na venda geral, avisamos toda a lista." : "Quem deixar o e-mail recebe um aviso na hora em que abrir."}</p>
        </div>
      )}
      {mode !== "agora" && (
        <>
          <label className="cv-lb">Tela de contagem <span>· é o que o público vê no lugar da página até a abertura</span></label>
          <div className="cv-themes">
            {THEMES.map((t) => (
              <button key={t.id} className={d.teaser.theme === t.id ? "cv-th on" : "cv-th"} type="button" onClick={() => (t.id === "foto" && !d.teaser.image ? file.current?.click() : setTeaser({ theme: t.id }))} aria-pressed={d.teaser.theme === t.id}>
                <span className={`pvw ${t.id}`} aria-hidden="true">
                  {t.id === "arte" && d.media.banner && <BannerArt id={d.media.banner} fit="fill" />}
                  {t.id === "foto" && d.teaser.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.teaser.image} alt="" />
                  )}
                  <i /><i /><i /><i />
                </span>
                <b>{t.t}</b><span className="s">{t.id === "foto" && busy ? "Enviando…" : t.s}</span>
              </button>
            ))}
          </div>
          <input ref={file} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Imagem de fundo da tela de contagem" onChange={(e) => void onImage(e.target.files?.[0])} />
          {d.teaser.theme === "foto" && d.teaser.image && <button className="cv-lnk" type="button" onClick={() => file.current?.click()}>Trocar imagem de fundo</button>}
          {d.teaser.theme === "arte" && !d.media.banner && <p className="cv-note">Envie o banner na etapa Artes para ele aparecer no fundo.</p>}
          <div className="cv-2">
            <label className="cv-fl"><span>Frase acima da contagem</span><input className="cv-in" value={d.teaser.headline} maxLength={80} onChange={(e) => setTeaser({ headline: e.target.value })} placeholder={mode === "pre" ? "A pré-venda começa em" : "As vendas abrem em"} /></label>
            <Toggle on={d.teaser.lineup} onClick={() => setTeaser({ lineup: !d.teaser.lineup })} title="Mostrar o line-up" sub={d.lineup.length ? `${d.lineup.length} ${d.lineup.length === 1 ? "artista" : "artistas"}` : "Adicione artistas em Informações"} />
          </div>
          <label className="cv-fl"><span>Recado para o público <small>(opcional)</small></span><textarea className="cv-in ta" rows={3} maxLength={280} value={d.teaser.message} onChange={(e) => setTeaser({ message: e.target.value })} placeholder="Ex.: Primeiro lote limitado. Quem entrar na lista recebe o aviso antes." /></label>
          <div className="cv-hint"><Spark size={16} /><span>No minuto da abertura a página libera a compra sozinha, sem você precisar fazer nada. Dá para mudar a data depois no painel, em Lançamento.</span></div>
        </>
      )}
    </section>
  );
}

/* =========================== REVISAR =========================== */
const VIS: { id: Visibility; t: string; s: string }[] = [
  { id: "publico", t: "Público", s: "Aparece na busca e na home" },
  { id: "link", t: "Só com link", s: "Fora da busca" },
  { id: "rascunho", t: "Rascunho", s: "Só você vê" },
];

export function RevisarStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, set, go } = c;
  const s0 = x.sessions[0];
  const when = s0 ? (x.sessions.length === 1 ? (() => { const t = parseIso(s0.date); return `${WD[t.getDay()]}, ${t.getDate()} ${MO[t.getMonth()]} · ${s0.time}`; })() : `${x.sessions.length} datas`) : "Sem data";
  const minPrice = Math.min(...d.sectors.flatMap((k) => effTypes(k, d.autoMeia).map((t) => (t.free ? 0 : toCents(t.price) / 100))));
  const rows: [number, string, string, boolean][] = [
    [0, "Tipo", d.cat ? `${d.cat === "Outros" ? d.catOther || "Outro" : d.cat} · ${{ unica: "uma data", temporada: "várias datas", turne: "turnê" }[d.mode]}` : "Não escolhido", x.ok[0]],
    [1, "Nome e faixa etária", `${d.title.trim() || "Sem nome"} · ${d.age}`, x.ok[1]],
    [1, "Descrição e line-up", d.desc ? `${d.desc.slice(0, 60)}${d.desc.length > 60 ? "…" : ""}${d.lineup.length ? ` · ${d.lineup.length} artistas` : ""}` : "Sem descrição. Eventos com descrição vendem mais.", !!d.desc.trim()],
    [2, "Quando", when, x.ok[2]],
    [3, "Onde", x.tour ? `${new Set(x.sessions.map((s) => s.city)).size} cidades` : d.venue.name ? `${d.venue.name} · ${d.venue.city || "falta a cidade"}` : "Sem local", x.ok[3]],
    [4, "Mapa", d.tmode === "mapa" ? (d.map === "done" ? `Mapa 3D com ${d.plan?.areas.length ?? 0} áreas` : "Mapa ainda não gerado") : "Sem mapa", x.ok[4]],
    [5, "Ingressos", x.nTypes ? `${x.nTypes} tipos · ${x.totalQty.toLocaleString("pt-BR")} ingressos · a partir de ${minPrice ? brMoney(minPrice) : "Grátis"}` : "Nenhum ingresso", x.ok[5]],
    [6, "Artes", `${["poster", "banner", "home", "strip", "share"].filter((k) => d.media[k as MediaKey]).length} de 5 enviadas${x.ok[6] ? "" : " · faltam cartaz e banner"}`, x.ok[6]],
    [7, "Vendas", !d.saleStart.trim() ? "Abrem ao publicar" : `${d.presaleStart.trim() ? `Pré-venda ${d.presaleStart} · ` : ""}abertura ${d.saleStart}`, x.ok[7]],
  ];
  const score = Math.round((rows.filter((r) => r[3]).length / rows.length) * 100);
  return (
    <section className="cv-st">
      <span className="cv-k"><b>Tudo pronto</b> · revise antes de publicar</span>
      <h1 className="cv-q">Bora colocar no ar?</h1>
      <div className="cv-b">
        <div className="cv-score">
          <div className="scr">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#2A2A2A" strokeWidth="7" /><circle cx="32" cy="32" r="27" fill="none" stroke="#D3F55B" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${((170 * score) / 100).toFixed(1)} 170`} transform="rotate(-90 32 32)" /></svg>
            <span>{score}</span>
          </div>
          <div><b>{score === 100 ? "Página completa" : "Quase lá"}</b><span className="s">{score === 100 ? "Tudo preenchido. Páginas completas vendem mais." : "Itens com ! impedem a publicação ou ajudam a vender. Toque para ajustar."}</span></div>
        </div>
        <div className="cv-rv">
          {rows.map(([st, t, v, ok], i) => (
            <button key={t} className="rvi" type="button" onClick={() => go(st)} style={{ animationDelay: `${i * 45}ms` }}>
              {ok ? <span className="ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D3F55B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span> : <span className="no">!</span>}
              <span className="tx"><b>{t}</b><span className="s">{v}</span></span><em>Editar</em>
            </button>
          ))}
        </div>
        <label className="cv-lb">Quem pode ver</label>
        <div className="cv-seg big">
          {VIS.map((v) => <button key={v.id} className={d.vis === v.id ? "sg on" : "sg"} type="button" onClick={() => set({ vis: v.id })}>{v.t}<small>{v.s}</small></button>)}
        </div>
        <label className="cv-fl" style={{ marginTop: 20 }}><span>Política de cancelamento</span><input className="cv-in" value={d.refund} onChange={(e) => set({ refund: e.target.value })} /></label>
      </div>
    </section>
  );
}
