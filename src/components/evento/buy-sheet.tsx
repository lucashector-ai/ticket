"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { brl } from "@/lib/format";
import { feeShares, MAX_INSTALLMENTS, money } from "@/lib/pricing";
import { ResaleCard } from "./resale-card";
import type { EventoData, SessionItem, TierItem } from "./types";
import type { Tickets } from "./use-tickets";

export type SheetStep = "data" | "setor" | "ingressos";
/** chave da etapa no histórico do navegador: o "voltar" do celular volta uma etapa em vez de sair da página */
const KEY = "twBuy";
const isStep = (v: unknown): v is SheetStep => v === "data" || v === "setor" || v === "ingressos";

const WD_FULL: Record<string, string> = { Dom: "Domingo", Seg: "Segunda", Ter: "Terça", Qua: "Quarta", Qui: "Quinta", Sex: "Sexta", "Sáb": "Sábado" };
const MS_FULL: Record<string, string> = { jan: "janeiro", fev: "fevereiro", mar: "março", abr: "abril", mai: "maio", jun: "junho", jul: "julho", ago: "agosto", set: "setembro", out: "outubro", nov: "novembro", dez: "dezembro" };
/** "Quinta, 19 de novembro" */
const longDay = (s: SessionItem) => {
  const [d, m] = s.day.split(" ");
  return `${WD_FULL[s.wd] ?? s.wd}, ${d} de ${MS_FULL[m] ?? m}`;
};
const onSale = (t: TierItem) => t.status === "open" && t.available > 0;
const fromLabel = (tiers: TierItem[]) => {
  const open = tiers.filter(onSale);
  if (!open.length) return null;
  const min = Math.min(...open.map((t) => t.priceCents));
  return min ? `a partir de ${brl(min)}` : "Grátis";
};
/** "Quinta, 19 de novembro de 2026" sem o ano quando é o ano corrente (cabe no topo da tela no celular) */
const noYear = (d: string) => d.replace(new RegExp(` de ${new Date().getFullYear()}$`), "");

/**
 * Texto do limite da escolha. O limite por pessoa vale para cada tipo de ingresso; o máximo por compra soma todos.
 * `head`: frase única no topo (null se não precisar); `perRow`: cada tipo mostra o seu limite.
 */
export function limitNote(tiers: TierItem[], maxPerOrder: number): { head: string | null; perRow: boolean } {
  const open = tiers.filter(onSale);
  if (!open.length) return { head: null, perRow: false };
  const limits = new Set(open.map((x) => x.limit));
  const cap = open.reduce((s, x) => s + x.limit, 0) > maxPerOrder ? `no máximo ${maxPerOrder} por compra` : null;
  if (limits.size === 1) {
    const l = [...limits][0];
    // o limite do tipo não aperta antes do máximo da compra: uma frase só
    if (open.length > 1 && l >= maxPerOrder) return { head: `Até ${maxPerOrder} ingressos por compra`, perRow: false };
    const base = open.length === 1 ? `Até ${l} ${l === 1 ? "ingresso" : "ingressos"} por pessoa` : `Até ${l} de cada tipo por pessoa`;
    return { head: cap && open.length > 1 ? `${base}, ${cap}` : base, perRow: false };
  }
  return { head: cap ? `No máximo ${maxPerOrder} ingressos por compra, somando todos os tipos` : null, perRow: true };
}

/** setores de uma data, na ordem em que aparecem */
function sectorsOf(e: EventoData, session: string | null) {
  const out: { name: string; color: string | null; tiers: TierItem[] }[] = [];
  for (const t of e.tiers) {
    if (e.sessions.length > 1 && t.sessionId !== session) continue;
    if (!t.sector) continue;
    const g = out.find((x) => x.name === t.sector);
    if (g) g.tiers.push(t); else out.push({ name: t.sector, color: t.sectorColor, tiers: [t] });
  }
  return out;
}

/**
 * Etapas da tela de compra no celular, guardadas no histórico do navegador (pushState na mesma URL):
 * o "voltar" do aparelho e o botão do topo voltam uma etapa e, na primeira, fecham a tela.
 */
export function useBuySheet() {
  const [step, setStep] = useState<SheetStep | null>(null);
  /** etapas que esta tela empilhou no histórico (para "Trocar" voltar em vez de empilhar de novo) */
  const stack = useRef<SheetStep[]>([]);
  useEffect(() => {
    const onPop = (ev: PopStateEvent) => {
      const s = isStep(ev.state?.[KEY]) ? (ev.state[KEY] as SheetStep) : null;
      stack.current = s ? stack.current.slice(0, Math.max(0, stack.current.lastIndexOf(s) + 1)) : [];
      setStep(s);
    };
    window.addEventListener("popstate", onPop);
    // voltou do checkout pelo "voltar" do navegador: a escolha reabre onde estava
    const s = window.history.state?.[KEY];
    const raf = isStep(s) && window.matchMedia("(max-width: 1024px)").matches ? requestAnimationFrame(() => setStep(s)) : 0;
    return () => { window.removeEventListener("popstate", onPop); cancelAnimationFrame(raf); };
  }, []);
  const go = useCallback((s: SheetStep) => {
    window.history.pushState({ ...window.history.state, [KEY]: s }, "");
    stack.current = [...stack.current, s];
    setStep(s);
  }, []);
  const back = useCallback(() => window.history.back(), []);
  /** volta para uma etapa anterior: pelo histórico se ela foi empilhada, senão empilha */
  const backTo = useCallback((s: SheetStep) => {
    const i = stack.current.lastIndexOf(s);
    if (i >= 0 && i < stack.current.length - 1) window.history.go(i - (stack.current.length - 1));
    else go(s);
  }, [go]);
  /** fecha tudo de uma vez (volta as etapas empilhadas) */
  const close = useCallback(() => {
    const n = stack.current.length;
    if (n) window.history.go(-n); else setStep(null);
  }, []);
  return { step, go, back, backTo, close };
}
export type BuySheetApi = ReturnType<typeof useBuySheet>;

/** Primeira etapa da compra: data (se tiver várias), setor (se tiver mais de um) ou direto os ingressos. */
export function firstStep(e: EventoData, session: string | null): SheetStep {
  if (e.sessions.length > 1) return "data";
  return sectorsOf(e, session).length > 1 ? "setor" : "ingressos";
}

/** Compra no celular em tela cheia: data → setor → ingressos, com o total e "Continuar" sempre embaixo. */
export function BuySheet({ e, t, s, onMap }: { e: EventoData; t: Tickets; s: BuySheetApi; onMap?: () => void }) {
  const step = s.step;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [cupOpen, setCupOpen] = useState(false);

  // fundo parado enquanto a tela está aberta (e o botão de acessibilidade/toast se ajustam pela classe)
  const open = step !== null;
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    document.body.classList.add("bs-open");
    // quem abriu a tela (para devolver o foco ao fechar)
    const opener = document.activeElement instanceof HTMLElement && !document.activeElement.closest(".bs") ? document.activeElement : null;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { s.back(); return; }
      // Tab fica dentro da tela cheia (aria-modal): do último volta ao primeiro e vice-versa
      if (ev.key !== "Tab") return;
      const box = document.querySelector<HTMLElement>(".bs");
      const items = box ? [...box.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null) : [];
      if (!box || !items.length) return;
      const first = items[0], last = items[items.length - 1], cur = document.activeElement;
      if (ev.shiftKey && (cur === first || !box.contains(cur))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (cur === last || !box.contains(cur))) { ev.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev; document.body.classList.remove("bs-open"); window.removeEventListener("keydown", onKey);
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>(".et-go");
      back?.focus({ preventScroll: true });
    };
  }, [open, s]);
  useEffect(() => { if (step) titleRef.current?.focus({ preventScroll: true }); }, [step]);

  if (!step) return null;

  const multiDay = e.sessions.length > 1;
  const sess = multiDay ? e.sessions.find((x) => x.id === t.session) ?? null : null;
  const when = sess ? `${longDay(sess)} · ${sess.sub}` : `${noYear(e.dateFull)}${e.timed ? ` · ${e.startTime}` : ""}`;
  const sectors = sectorsOf(e, t.session);
  const hasSectors = sectors.length > 1;
  const steps: SheetStep[] = [...(multiDay ? ["data" as const] : []), ...(hasSectors ? ["setor" as const] : []), "ingressos"];
  const idx = steps.indexOf(step);
  const allFree = t.nq > 0 && t.subtotal === 0;
  const lim = limitNote(t.visibleTiers, e.maxPerOrder);
  // taxa de cada linha escolhida: a taxa do pedido (calculada no total) dividida entre as linhas, para a soma
  // das linhas fechar com o total da barra; sem escolha, a taxa de um ingresso
  const picked = e.tiers.filter((x) => (t.qty[x.id] ?? 0) > 0);
  const shares = feeShares(t.totalWithFee - t.total, picked.map((x) => x.priceCents * t.qty[x.id]));
  const lineFee = new Map(picked.map((x, i) => [x.id, shares[i]]));
  const fee = (x: TierItem) => lineFee.get(x.id) ?? Math.round(x.priceCents * e.feeRate);

  const pickDay = (id: string) => {
    t.setSession(id);
    t.setSector(null);
    s.go(sectorsOf(e, id).length > 1 ? "setor" : "ingressos");
  };
  const pickSector = (name: string) => { t.setSector(name); s.go("ingressos"); };

  const head = step === "data"
    ? { sub: e.title, title: "Escolha a data" }
    : step === "setor"
      ? { sub: when, title: "Escolha o setor" }
      : { sub: e.title, title: "Escolha os ingressos" };

  return (
    <div className="bs" role="dialog" aria-modal="true" aria-labelledby="bs-t">
      <div className="bs-top">
        <button className="bs-ib" type="button" onClick={s.back} aria-label={idx > 0 ? "Voltar uma etapa" : "Fechar"}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
        </button>
        <div className="bs-tt">
          <small>{head.sub}</small>
          <h2 id="bs-t" ref={titleRef} tabIndex={-1}>{head.title}</h2>
          {steps.length > 1 && (
            <div className="bs-dots" aria-hidden="true">{steps.map((x, i) => <i key={x} className={i < idx ? "ok" : i === idx ? "on" : undefined} />)}</div>
          )}
        </div>
        <span aria-hidden="true" />
      </div>

      <div className="bs-b" key={step}>
        {step === "data" && (
          <>
            {e.sessions.map((x) => {
              const tiers = e.tiers.filter((y) => y.sessionId === x.id);
              const from = fromLabel(tiers);
              const n = tiers.reduce((acc, y) => acc + (t.qty[y.id] ?? 0), 0);
              const [d, m] = x.day.split(" ");
              return (
                <button key={x.id} type="button" className={from ? "bs-d" : "bs-d so"} onClick={() => pickDay(x.id)} disabled={!from}>
                  <span className="bs-cal" aria-hidden="true"><small>{x.wd}</small><b>{d}</b><em>{m}</em></span>
                  <span className="bs-i"><b>{longDay(x)}</b><span>{x.sub}{from ? ` · ${from}` : " · Esgotado"}</span></span>
                  {n > 0 && <i className="bs-n">{n}</i>}
                  <Chev />
                </button>
              );
            })}
            <p className="bs-note">Horários no fuso do local do evento.</p>
          </>
        )}

        {step === "setor" && (
          <>
            {sectors.map((g) => {
              const from = fromLabel(g.tiers);
              const n = g.tiers.reduce((acc, y) => acc + (t.qty[y.id] ?? 0), 0);
              return (
                <button key={g.name} type="button" className={from ? "bs-s" : "bs-s so"} onClick={() => pickSector(g.name)}>
                  <i className="bs-sw" style={{ background: g.color ?? "#111" }} aria-hidden="true" />
                  <span className="bs-i"><b>{g.name}</b><span>{g.tiers.length} {g.tiers.length === 1 ? "tipo de ingresso" : "tipos de ingresso"}</span></span>
                  {n > 0 && <i className="bs-n">{n}</i>}
                  <span className="bs-pr">{from ? <><small>{from.startsWith("a partir") ? "a partir de" : ""}</small><b>{from.replace("a partir de ", "")}</b></> : <small>Esgotado</small>}</span>
                  <Chev />
                </button>
              );
            })}
            {e.venueMap && onMap && (
              <button type="button" className="bs-map" onClick={onMap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>
                Ver mapa dos setores
              </button>
            )}
          </>
        )}

        {step === "ingressos" && (
          <>
            {(multiDay || hasSectors || t.sector) && (
              <div className="bs-ctx">
                <i style={t.sector ? { background: sectors.find((g) => g.name === t.sector)?.color ?? "#EDFF3C" } : undefined} aria-hidden="true" />
                <div><b>{t.sector ?? "Ingressos"}</b><span>{when}</span></div>
                {(multiDay || hasSectors) && <button type="button" onClick={() => s.backTo(hasSectors ? "setor" : "data")}>Trocar</button>}
              </div>
            )}
            {e.launch.access && <p className="bs-pv"><i aria-hidden="true" />Pré-venda liberada para você · uma compra com este link</p>}
            {lim.head && <p className="bs-lim">{lim.head}</p>}
            {t.visibleTiers.map((x) => <Row key={x.id} x={x} t={t} fee={fee(x)} showLimit={lim.perRow} />)}

            <div className={cupOpen || t.coupon ? "bs-cup on" : "bs-cup"}>
              {cupOpen || t.coupon ? (
                <div className="bs-cupf">
                  <input autoComplete="off" type="text" placeholder="Código do cupom" value={t.couponInput} onChange={(ev) => t.setCouponInput(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); t.applyCoupon(); } }} aria-label="Cupom de desconto" />
                  <button type="button" onClick={t.applyCoupon} disabled={t.checking}>{t.checking ? "…" : "Aplicar"}</button>
                </div>
              ) : (
                <button type="button" className="bs-cupb" onClick={() => setCupOpen(true)}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>
                  Tenho um cupom de desconto
                </button>
              )}
              {t.couponMessage && <p className={t.couponMessage.cls} role="status">{t.couponMessage.text}</p>}
            </div>

            {t.nq >= 2 && !allFree && (
              <button className="bs-grp" type="button" onClick={t.group} disabled={t.grouping || t.pending}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9.5" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4 4 0 0 1 6.5-3" /></svg>
                {t.grouping ? "Reservando…" : "Comprar em grupo e dividir o valor"}
              </button>
            )}
            <p className="bs-note">Ingressos nominais: na próxima etapa você diz quem vai usar cada um.{e.halfPrice ? "" : " Meia-entrada com documento na entrada."}</p>
            <ResaleCard e={e} inline />
          </>
        )}
      </div>

      <div className="bs-f">
        <div className={t.nq ? "bs-bar" : "bs-bar off"}>
          <div aria-live="polite">
            <span>{t.nq ? `${t.nq} ${t.nq === 1 ? "ingresso" : "ingressos"}${allFree || !e.feeRate ? "" : " · com taxas"}` : "Nenhum ingresso"}</span>
            <b>{allFree ? "Grátis" : money(t.totalWithFee)}</b>
          </div>
          <button type="button" onClick={t.checkout} disabled={!t.nq || t.pending}>
            {t.pending ? "Abrindo…" : !t.nq ? "Escolha um ingresso" : allFree ? "Garantir" : "Continuar"}
            {t.nq > 0 && !t.pending && <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>}
          </button>
        </div>
        {!allFree && <p>Pague com Pix ou em até {MAX_INSTALLMENTS}x no cartão</p>}
      </div>
    </div>
  );
}

function Row({ x, t, fee, showLimit }: { x: TierItem; t: Tickets; fee: number; showLimit: boolean }) {
  const q = t.qty[x.id] ?? 0;
  const open = onSale(x);
  const upcoming = x.status === "upcoming";
  const label = x.sector && !t.sector ? `${x.sector} · ${x.name}` : x.name;
  // no limite (por pessoa, por compra ou estoque) o "+" fica apagado, mas o toque ainda explica o motivo
  const full = open && !t.canInc(x.id);
  const owned = x.owned ?? 0;
  const extra = [x.desc, showLimit && open ? `Até ${x.limit} por pessoa` : null, owned > 0 ? `Você já tem ${owned}` : null].filter(Boolean).join(" · ");
  return (
    <div className={!open && !upcoming ? "bs-t so" : q > 0 ? "bs-t sel" : "bs-t"}>
      <span className="bs-tn">{label}{open && x.note && x.note.length <= 22 && <em>{x.note}</em>}</span>
      {open ? (
        <span className="bs-q">
          <button type="button" onClick={() => t.dec(x.id)} disabled={q === 0} aria-label={`Remover um ${label}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2.5 6h7" /></svg>
          </button>
          <span>{q}</span>
          <button type="button" className="bs-pl" onClick={() => t.inc(x.id)} aria-label={`Adicionar um ${label}`} aria-disabled={full || undefined}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 2.5v7M2.5 6h7" /></svg>
          </button>
        </span>
      ) : (
        <span className="bs-so">{upcoming ? x.note ?? "Em breve" : x.status === "closed" ? "Encerrado" : "Esgotado"}</span>
      )}
      <span className="bs-p">{q > 1 && x.priceCents > 0 && `${q} × `}{x.priceCents ? money(x.priceCents) : "Grátis"}{x.priceCents > 0 && fee > 0 && <small>+ {money(fee)} taxa</small>}</span>
      {extra && <span className="bs-td">{extra}</span>}
    </div>
  );
}

function Chev() {
  return <svg className="bs-cv" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>;
}
