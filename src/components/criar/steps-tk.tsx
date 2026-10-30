"use client";

import { useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import {
  effTypes, joinBr, limitOf, MAX_LIMIT, MEIA_DESC, meiaSug, num, PALETTE, splitBr, toCents,
  type DraftSector, type DraftType, type MediaKey, type Teaser, type TypeKind, type Visibility,
} from "@/lib/criar/model";
import type { Derived } from "./flow";
import { sectorMeia } from "@/lib/criar/meia";
import { MapaPane } from "./mapa";
import { brMoney, MO, parseIso, shortMoney, Spark, uploadImage, WD, type Ctx } from "./shared";
import { Ico, StepHead, Toggle } from "./steps";

/* =========================== 5. MAPA =========================== */
const DEFAULT_SECTORS: [string, string][] = [["Pista", "#7DA2FF"], ["Pista Premium", "#EDFF3C"], ["Camarote", "#FF8AD8"]];

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
const ADD_TYPES: { kind: TypeKind; label: string; sub: string; name: string; desc: string; free?: boolean; limit: string }[] = [
  { kind: "inteira", label: "Inteira", sub: "Preço cheio, para todo mundo.", name: "Inteira", desc: "", limit: "6" },
  { kind: "meia", label: "Meia-entrada", sub: "50% da inteira, com documento (Lei 12.933).", name: "Meia-entrada", desc: MEIA_DESC, limit: "6" },
  { kind: "social", label: "Meia social", sub: "Mais barata que a inteira com 1 kg de alimento.", name: "Meia social", desc: "Leve 1 kg de alimento não perecível. Doado a uma instituição parceira.", limit: "4" },
  { kind: "outro", label: "VIP / Open bar", sub: "Área ou benefício extra, preço maior.", name: "VIP", desc: "", limit: "4" },
  { kind: "outro", label: "Gratuito", sub: "Sem custo: o público garante a vaga com o QR.", name: "Ingresso gratuito", desc: "", free: true, limit: "2" },
  { kind: "outro", label: "Personalizado", sub: "Você define nome, preço e regras.", name: "Novo ingresso", desc: "", limit: "4" },
];
const MAP_SECTORS = ["Pista", "Pista Premium", "Camarote", "Área VIP", "Arquibancada", "Cadeira numerada"];
const money = (v: number) => String(Math.round(Math.max(0, v) * 100) / 100).replace(".", ",");


const DOT: Record<TypeKind, string> = { inteira: "dt int", meia: "dt meia", social: "dt soc", outro: "dt own" };

/** Aviso da meia (Lei 12.933): metade da inteira; se o preço digitado for outro, mostra a metade e um atalho para usar. */
function MeiaHint({ inteira, price, use }: { inteira: number; price: string; use: (v: string) => void }) {
  if (inteira <= 0) return null;
  const half = Math.round(inteira * 50) / 100;
  if (toCents(price) === Math.round(half * 100)) return <span className="cv-sug"><Spark size={12} />Metade da inteira, como prevê a Lei 12.933</span>;
  // acima da inteira o servidor não publica (meiaPriceError): avisa já na tabela
  const over = toCents(price) > Math.round(inteira * 100);
  return (
    <span className={over ? "cv-sug off bad" : "cv-sug off"} role={over ? "alert" : undefined}>
      <span>{over ? `A meia não pode custar mais que a inteira (${brMoney(inteira)}).` : `Pela Lei 12.933, a meia é a metade: ${brMoney(half)}.`}</span>
      <button type="button" onClick={() => use(String(half).replace(".", ","))}>Usar {brMoney(half)}</button>
    </span>
  );
}

/** Setor (ou "Ingressos", sem setores): tabela Ingresso | Preço | Quantidade | Limite por pessoa, como no design v2. */
function SectorCard({ c, k, i, many }: { c: Ctx; k: DraftSector; i: number; many: boolean }) {
  const { d, upd } = c;
  const setSector = (fn: (z: DraftSector) => DraftSector) => upd((o) => ({ ...o, sectors: o.sectors.map((z) => (z.id === k.id ? fn(z) : z)) }), "tk");
  const setType = (tid: string, patch: Partial<DraftType>) => setSector((z) => ({ ...z, types: z.types.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));
  const types = effTypes(k, d.autoMeia);
  let cap = 0, inteira = 0;
  for (const t of types) { cap += num(t.qty); if (t.kind === "inteira" && !t.free) inteira = num(t.price); }
  const ro = () => c.flash("Nome, quantidade e limite desta meia seguem a Inteira. Para mudar, desligue a meia automática nas regras da venda.");
  // meia automática: o preço é editável (D-09) e fica guardado na Inteira de origem; vazio volta para a metade
  const baseOf = (t: { id: string }) => k.types.find((u) => `${u.id}-m` === t.id);
  const setMeia = (t: { id: string }, v: string | undefined) => { const b = baseOf(t); if (b) setType(b.id, { meia: v }); };
  const [adding, setAdding] = useState(false);
  const nextColor = () => setSector((z) => ({ ...z, color: PALETTE[(PALETTE.indexOf(z.color) + 1) % PALETTE.length] }));
  return (
    <div className="cv-sec" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="h">
        <button className="cv-dot" type="button" style={{ background: k.color }} onClick={nextColor} aria-label="Trocar a cor do setor" title="Trocar a cor" />
        {many ? <input autoComplete="off" className="nm" value={k.name} maxLength={80} onChange={(e) => setSector((z) => ({ ...z, name: e.target.value }))} aria-label="Nome do setor" /> : <b className="nm">Ingressos</b>}
        <span className="s">{types.length} {types.length === 1 ? "tipo" : "tipos"} · {cap.toLocaleString("pt-BR")} {types.every((t) => t.free) ? "vagas" : "ingressos"}</span>
        {many && d.sectors.length > 1 && <button className="cv-rm" type="button" onClick={() => upd((o) => ({ ...o, sectors: o.sectors.filter((z) => z.id !== k.id) }), "tk")} aria-label={`Remover ${k.name}`}>×</button>}
        <button className={k.open ? "cv-chev o" : "cv-chev"} type="button" onClick={() => setSector((z) => ({ ...z, open: !z.open }))} aria-expanded={k.open} aria-label={`Abrir ${k.name}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></button>
      </div>
      {k.open && (
        <div className="cv-tbx">
          <div className="cv-tbh" aria-hidden="true"><span>Ingresso</span><span>Preço</span><span>Quantidade</span><span>Limite por pessoa</span><span /></div>
          {types.map((t) => {
            const lim = limitOf(t);
            return (
              <div key={t.id} className={t.auto ? "cv-tbr auto" : "cv-tbr"}>
                <div className="tn">
                  <i className={t.free ? "dt free" : DOT[t.kind]} aria-hidden="true" />
                  <div className="tn-i">
                    <input autoComplete="off" className="tn-n" value={t.name} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { name: e.target.value })} aria-label="Nome do ingresso" />
                    <input autoComplete="off" className="tn-d" value={t.desc} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { desc: e.target.value })} placeholder="+ descrição (opcional)" aria-label={`Descrição de ${t.name}`} />
                  </div>
                </div>
                <div className="cell" data-l="Preço">
                  {t.free
                    ? <button className="pr ro free" type="button" onClick={() => setType(t.id, { free: false })} title="Tocar para cobrar"><b>Grátis</b><small>tocar para cobrar</small></button>
                    : t.auto
                      ? <label className="pr"><span className="cur">R$</span><input autoComplete="off" inputMode="decimal" value={baseOf(t)?.meia ?? t.price} placeholder={meiaSug(baseOf(t)?.price ?? "")}
                          onChange={(e) => setMeia(t, e.target.value.replace(/[^\d,]/g, ""))}
                          onBlur={(e) => { const b = baseOf(t); if (b && (num(e.target.value) <= 0 || toCents(e.target.value) === toCents(meiaSug(b.price)))) setMeia(t, undefined); }}
                          aria-label={`Preço de ${t.name}`} /></label>
                      : <label className="pr"><span className="cur">R$</span><input autoComplete="off" inputMode="decimal" value={t.price} onChange={(e) => setType(t.id, { price: e.target.value.replace(/[^\d,]/g, "") })} placeholder="0" aria-label={`Preço de ${t.name}`} />
                        <button className="fr" type="button" onClick={() => setType(t.id, { free: true })} title="Deixar grátis">grátis</button></label>}
                </div>
                <div className="cell" data-l="Qtd.">
                  {t.auto ? <span className="qt2 ro" onClick={ro}><b>{t.qty}</b><span>un.</span></span>
                    : <label className="qt2"><input autoComplete="off" inputMode="numeric" value={t.qty} onChange={(e) => setType(t.id, { qty: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="0" aria-label={`Quantidade de ${t.name}`} /><span>un.</span></label>}
                </div>
                <div className="cell" data-l="Por pessoa">
                  <div className="lm">
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.max(1, lim - 1)) })} disabled={!t.auto && lim <= 1} aria-label={`Diminuir limite de ${t.name}`}>−</button>
                    <b>{lim}</b>
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.min(MAX_LIMIT, lim + 1)) })} disabled={!t.auto && lim >= MAX_LIMIT} aria-label={`Aumentar limite de ${t.name}`}>+</button>
                  </div>
                </div>
                {!t.auto && types.length > 1
                  ? <button className="cv-rm" type="button" onClick={() => setSector((z) => ({ ...z, types: z.types.filter((u) => u.id !== t.id) }))} aria-label={`Remover ${t.name}`}>×</button>
                  : <span />}
                {t.kind === "social" && inteira > 0 && !t.free && <span className="cv-sug"><Spark size={12} />Sugestão: {brMoney(Math.round(inteira * 0.6))}, entre a meia e a inteira</span>}
                {t.kind === "meia" && !t.free && <MeiaHint inteira={t.auto ? num(baseOf(t)?.price) : inteira} price={t.price} use={(v) => (t.auto ? setMeia(t, undefined) : setType(t.id, { price: v }))} />}
              </div>
            );
          })}
          {/* cota de meia do setor (40% dos lugares do setor, decisão do dono; o servidor confere na venda) */}
          {types.some((t) => !t.free && (t.kind === "meia" || t.kind === "inteira")) && (() => {
            const m = sectorMeia(k, d.autoMeia);
            if (!m.seats) return null;
            return m.meiaQty > m.cap
              ? <p className="cv-mq off">A venda de meia para em {m.cap.toLocaleString("pt-BR")}, mesmo com {m.meiaQty.toLocaleString("pt-BR")} no tipo Meia (40% dos {m.seats.toLocaleString("pt-BR")} lugares{many ? " do setor" : ""}).</p>
              : <p className="cv-mq">Meia-entrada: até {m.cap.toLocaleString("pt-BR")} de {m.seats.toLocaleString("pt-BR")} lugares{many ? " do setor" : ""} (40%, Lei 12.933).</p>;
          })()}
          <div className="cv-addw" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setAdding(false); }}>
            <button className="cv-addb" type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><span>+</span>Adicionar tipo de ingresso</button>
            {adding && (
              <div className="cv-pop">
                {ADD_TYPES.filter((a) => a.kind === "outro" || a.kind === "inteira" || !k.types.some((t) => t.kind === a.kind)).map((a) => (
                  <button key={a.label} className="cv-pop-i" type="button" onClick={() => {
                    const price = a.kind === "meia" && inteira ? money(inteira / 2) : a.kind === "social" && inteira ? money(Math.round(inteira * 0.6)) : "";
                    setSector((z) => ({ ...z, open: true, types: [...z.types, { id: c.nid("t"), kind: a.kind, name: a.name, price, qty: "100", desc: a.desc, free: a.free, limit: a.limit }] }));
                    setAdding(false);
                  }}><b>{a.label}</b><span className="s">{a.sub}</span></button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function IngressosStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, set, upd } = c;
  const many = d.tmode === "mapa" || d.sectors.length > 1;
  // gratuito = todos os tipos grátis; voltar para pago tira o "grátis" de todos
  const paid = d.sectors.some((k) => k.types.some((t) => !t.free));
  const setPaid = (v: boolean) => upd((o) => ({ ...o, sectors: o.sectors.map((k) => ({ ...k, types: k.types.map((t) => ({ ...t, free: !v })) })) }), "tk");
  const meiaWarn = paid && !d.autoMeia && !d.sectors.some((k) => k.types.some((t) => t.kind === "meia"));
  const [cps, setCps] = useState(d.coupons.length > 0);
  const [rules, setRules] = useState(false);
  const toSingle = () => upd((o) => {
    if (o.sectors.length <= 1) return { ...o, sectors: o.sectors.map((k) => ({ ...k, name: "Ingressos", open: true })) };
    const all = o.sectors.flatMap((k) => k.types.map((t) => ({ ...t, name: `${k.name} · ${t.name}` })));
    return { ...o, sectors: [{ id: "k1", name: "Ingressos", color: "#EDFF3C", open: true, types: all }] };
  }, "tk");
  const toSectors = () => upd((o) => (o.sectors.length > 1 ? o : {
    ...o, sectors: [{ ...o.sectors[0], name: o.sectors[0].name === "Ingressos" ? "Pista" : o.sectors[0].name, open: true },
      { id: c.nid("k"), name: "Pista Premium", color: "#EDFF3C", open: false, types: [{ id: c.nid("t"), kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }] }],
  }), "tk");
  const addSector = (n: string) => upd((o) => ({
    ...o, sectors: [...o.sectors.map((z) => ({ ...z, open: false })), {
      id: c.nid("k"), name: n, color: PALETTE.find((p) => !o.sectors.some((z) => z.color === p)) ?? PALETTE[o.sectors.length % PALETTE.length], open: true,
      types: [{ id: c.nid("t"), kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }],
    }],
  }), "tk");
  const setCp = (id: string, patch: Partial<(typeof d.coupons)[number]>) => upd((o) => ({ ...o, coupons: o.coupons.map((y) => (y.id === id ? { ...y, ...patch } : y)) }));
  const OPT: [keyof typeof d & ("autoMeia" | "fee" | "transfer" | "resale"), string, string][] = [
    ["autoMeia", "Criar meia-entrada automaticamente", "Todo tipo Inteira ganha uma Meia pela metade do valor (Lei 12.933). O preço dá para ajustar na tabela."],
    ["fee", "Repassar taxa ao comprador", "O preço aparece com “+ taxas”. Desligado, a taxa de 7,99% sai do seu repasse."],
    ["transfer", "Permitir transferência", "O fã envia o ingresso para outra pessoa. O QR antigo deixa de valer na hora."],
    ["resale", "Permitir revenda oficial", "Quem não puder ir revende aqui, sem passar do valor pago, e o comprador recebe um QR novo."],
  ];
  return (
    <section className="cv-st cv-wide cv-noenter">
      <StepHead n={6} k="ingressos" q="Como você quer vender?" s="Responda duas perguntas e a gente monta os ingressos. Depois é só ajustar os números." />
      <div className="cv-acc">
        <button className="h" type="button" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          <span className="tx"><b>Regras da venda</b>
            <span className="cv-rch">{OPT.map(([k]) => <i key={k} className={d[k] ? "on" : ""}>{{ autoMeia: "Meia automática", fee: d.fee ? "Taxa paga pelo comprador" : "Taxa paga por você", transfer: "Transferência", resale: "Revenda oficial" }[k]}{k !== "fee" && !d[k] ? " desligada" : ""}</i>)}</span>
          </span>
          <span className={rules ? "cv-chev o" : "cv-chev"} aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
        </button>
        {rules && (
          <div className="cv-opt4">
            {OPT.map(([k, t, s]) => <Toggle key={k} on={!!d[k]} onClick={() => set({ [k]: !d[k] } as Partial<typeof d>, "tk")} title={t} sub={s} />)}
          </div>
        )}
      </div>

      <div className="cv-qa"><span className="qn">1</span><b className="qt">O evento é pago ou gratuito?</b></div>
      <div className="cv-mo2">
        {[
          { on: paid, t: "Pago", s: "Você define os preços. Meia-entrada calculada sozinha.", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", act: () => setPaid(true) },
          { on: !paid, t: "Gratuito", s: "Inscrição grátis, sem taxa. O público garante a vaga com o QR.", icon: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z", act: () => setPaid(false) },
        ].map((m) => (
          <button key={m.t} className={m.on ? "mo on" : "mo"} type="button" onClick={m.act} aria-pressed={m.on}><span className="ic"><Ico d={m.icon} /></span><b>{m.t}</b><span className="s">{m.s}</span></button>
        ))}
      </div>

      <div className="cv-qa"><span className="qn">2</span><b className="qt">Como organizar os preços?</b></div>
      <div className="cv-mo2">
        {[
          { on: !many, t: "Ingresso único", s: d.tmode === "mapa" ? "Com mapa 3D, os ingressos são por setor." : "Os mesmos ingressos para todo mundo.", icon: "M4 7h16M4 12h16M4 17h16", act: toSingle, off: d.tmode === "mapa" },
          { on: many, t: "Por setores", s: "Um preço para cada área: pista, camarote, VIP…", icon: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15", act: toSectors, off: false },
        ].map((m) => (
          <button key={m.t} className={`mo mo-sm${m.on ? " on" : ""}${m.off ? " off" : ""}`} type="button" onClick={m.off ? () => c.flash("Com mapa 3D, cada área do mapa é um setor.") : m.act} aria-pressed={m.on}><span className="ic"><Ico d={m.icon} /></span><b>{m.t}</b><span className="s">{m.s}</span></button>
        ))}
      </div>

      <div className="cv-qa"><span className="qn">3</span><b className="qt">Ajuste os ingressos</b><span className="qh">Toque nos números para editar</span></div>
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
      {meiaWarn && <div className="cv-warn3"><b>Falta a meia-entrada.</b><span>A Lei 12.933 garante meia para estudantes, PcD, jovens de baixa renda e maiores de 60. Ligue “Meia automática” nas regras da venda.</span></div>}
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
                <input autoComplete="off" className="code" value={cp.code} maxLength={40} placeholder="CODIGO10" onChange={(e) => setCp(cp.id, { code: e.target.value.toUpperCase().replace(/\s/g, "") })} aria-label="Código do cupom" />
                <div className="cv-seg sm"><button className={cp.kind === "pct" ? "sg on" : "sg"} type="button" onClick={() => setCp(cp.id, { kind: "pct" })}>%</button><button className={cp.kind === "brl" ? "sg on" : "sg"} type="button" onClick={() => setCp(cp.id, { kind: "brl" })}>R$</button></div>
                <label className="f"><span>Desconto</span><input autoComplete="off" inputMode="decimal" value={cp.value} onChange={(e) => setCp(cp.id, { value: e.target.value.replace(/[^\d,]/g, "") })} /></label>
                <label className="f"><span>Usos</span><input autoComplete="off" inputMode="numeric" value={cp.limit} onChange={(e) => setCp(cp.id, { limit: e.target.value.replace(/\D/g, "") })} /></label>
                <label className="f"><span>Válido até</span><input autoComplete="off" value={cp.until} onChange={(e) => setCp(cp.id, { until: e.target.value })} placeholder="dd/mm/aaaa" /></label>
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
  { id: "banner", title: "Banner", ratio: "16 / 9", w: 1920, h: 1080, req: false, where: "Topo da página do evento e fundo da tela de contagem. Sem banner, montamos um com o cartaz", mock: "ev" },
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
  // banner opcional: sem ele, "Onde aparece" mostra o banner montado com o cartaz
  const auto = !url && m.id === "banner" && c.d.media.poster ? <BannerArt id={c.d.media.poster} fit="fill" poster /> : null;
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
        <div className={`cv-mk ${m.mock}`}><span className="bar" /><span className="slot">{art ?? auto}</span><span className="l1" /><span className="l2" /><span className="l3" /></div>
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
                <input autoComplete="off" type="date" value={pre.date} onChange={(e) => set({ presaleStart: joinBr(e.target.value, pre.time || "12:00") }, "sale")} aria-label="Dia da pré-venda" />
                <input autoComplete="off" type="time" value={pre.time} onChange={(e) => set({ presaleStart: joinBr(pre.date, e.target.value) }, "sale")} aria-label="Hora da pré-venda" />
              </div>
            </div>
          )}
          <div className="w">
            <span className="k"><i />{mode === "pre" ? "Venda geral para todos" : "Abertura das vendas"}</span>
            <div className="r">
              <input autoComplete="off" type="date" value={open.date} onChange={(e) => set({ saleStart: joinBr(e.target.value, open.time || "12:00") }, "sale")} aria-label="Dia da abertura" />
              <input autoComplete="off" type="time" value={open.time} onChange={(e) => set({ saleStart: joinBr(open.date, e.target.value) }, "sale")} aria-label="Hora da abertura" />
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
                  {t.id === "arte" && (d.media.banner || d.media.poster) && <BannerArt id={(d.media.banner ?? d.media.poster)!} fit="fill" poster={!d.media.banner} />}
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
          {d.teaser.theme === "arte" && !d.media.banner && !d.media.poster && <p className="cv-note">Envie o cartaz na etapa Artes para ele aparecer no fundo.</p>}
          <div className="cv-2">
            <label className="cv-fl"><span>Frase acima da contagem</span><input autoComplete="off" className="cv-in" value={d.teaser.headline} maxLength={80} onChange={(e) => setTeaser({ headline: e.target.value })} placeholder={mode === "pre" ? "A pré-venda começa em" : "As vendas abrem em"} /></label>
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
    [6, "Artes", `${["poster", "banner", "home", "strip", "share"].filter((k) => d.media[k as MediaKey]).length} de 5 enviadas${x.ok[6] ? "" : " · falta o cartaz"}`, x.ok[6]],
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
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#2A2A2A" strokeWidth="7" /><circle cx="32" cy="32" r="27" fill="none" stroke="#EDFF3C" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${((170 * score) / 100).toFixed(1)} 170`} transform="rotate(-90 32 32)" /></svg>
            <span>{score}</span>
          </div>
          <div><b>{score === 100 ? "Página completa" : "Quase lá"}</b><span className="s">{score === 100 ? "Tudo preenchido. Páginas completas vendem mais." : "Itens com ! impedem a publicação ou ajudam a vender. Toque para ajustar."}</span></div>
        </div>
        <div className="cv-rv">
          {rows.map(([st, t, v, ok], i) => (
            <button key={t} className="rvi" type="button" onClick={() => go(st)} style={{ animationDelay: `${i * 45}ms` }}>
              {ok ? <span className="ok"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EDFF3C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span> : <span className="no">!</span>}
              <span className="tx"><b>{t}</b><span className="s">{v}</span></span><em>Editar</em>
            </button>
          ))}
        </div>
        <label className="cv-lb">Quem pode ver</label>
        <div className="cv-seg big">
          {VIS.map((v) => <button key={v.id} className={d.vis === v.id ? "sg on" : "sg"} type="button" onClick={() => set({ vis: v.id })}>{v.t}<small>{v.s}</small></button>)}
        </div>
        <label className="cv-fl" style={{ marginTop: 20 }}><span>Observações (opcional)</span><textarea className="cv-in ta" rows={2} maxLength={300} value={d.refund} onChange={(e) => set({ refund: e.target.value })} placeholder="Ex.: troca de titular só até 24h antes do evento." aria-describedby="cv-obs-h" /></label>
        <p className="cv-note" id="cv-obs-h">Aparece na página do evento como &ldquo;Observação do produtor&rdquo;, junto da regra de cancelamento. A regra em si (prazos e reembolso) fica no painel, em Cancelamentos e reembolsos.</p>
      </div>
    </section>
  );
}
