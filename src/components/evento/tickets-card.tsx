"use client";

import { useState } from "react";
import { brl } from "@/lib/format";
import type { EventoData, TierItem } from "./types";
import type { Tickets } from "./use-tickets";
import { ResaleCard } from "./resale-card";
import { limitNote } from "./buy-sheet";

type Group = { name: string | null; color: string | null; tiers: TierItem[] };

const price = (cents: number) => (cents ? brl(cents) : "Grátis");

export function TicketsCard({ e, t }: { e: EventoData; t: Tickets }) {
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});
  // um limite só para todos os tipos vai no topo; limites diferentes aparecem em cada tipo
  const lim = limitNote(t.visibleTiers, e.maxPerOrder);
  const allFree = t.nq > 0 && t.subtotal === 0;
  // ingressos agrupados por setor (na ordem em que aparecem); sem setor, lista simples
  const groups: Group[] = [];
  for (const tier of t.visibleTiers) {
    const key = tier.sector ?? null;
    const g = groups.find((x) => x.name === key);
    if (g) g.tiers.push(tier); else groups.push({ name: key, color: tier.sectorColor ?? null, tiers: [tier] });
  }
  return (
    <div className="buy" id="ingressos">
      {/* a lista rola dentro do cartão; o total e o botão ficam sempre à vista no rodapé */}
      <div className="buy-sc">
      <div className="buy-h">
        <h2>Ingressos</h2>
      </div>
      {lim.head && <p className="buy-lim">{lim.head}</p>}
      {e.launch.access && <p className="ln-pv"><i aria-hidden="true" />Pré-venda liberada para você · uma compra com este link</p>}
      {e.minPriceCents > 0 ? <p className="from">A partir de <b>{brl(e.minPriceCents)}</b></p> : e.tiers.some((x) => x.priceCents === 0) && <p className="from">Entrada <b>grátis</b></p>}
      {e.sessions.length > 1 && (
        <>
          <span className="sess-l">Escolha a data</span>
          <div className="sess-p" role="radiogroup" aria-label="Datas">
            {e.sessions.map((s) => {
              const n = e.tiers.filter((x) => x.sessionId === s.id).reduce((acc, x) => acc + (t.qty[x.id] ?? 0), 0);
              return (
                <button key={s.id} type="button" role="radio" aria-checked={t.session === s.id} className={t.session === s.id ? "pd on" : "pd"} onClick={() => t.setSession(s.id)}>
                  <span className="pd-w">{s.wd}</span><b className="pd-d">{s.day}</b><span className="pd-c">{s.sub}</span>
                  {n > 0 && <i className="pd-n">{n}</i>}
                </button>
              );
            })}
          </div>
        </>
      )}
      {t.sector && (
        <div className="sec-f">
          <span>Setor: <b>{t.sector}</b></span>
          <button type="button" onClick={() => t.setSector(null)}>Ver todos</button>
        </div>
      )}
      <div className="tiers">
        {groups.map((g) => {
          if (!g.name) return g.tiers.map((tier) => <TierRow key={tier.id} tier={tier} t={t} showLimit={lim.perRow} />);
          const sel = g.tiers.reduce((acc, x) => acc + (t.qty[x.id] ?? 0), 0);
          const open = openSecs[g.name] ?? (g === groups[0] || sel > 0 || t.sector === g.name);
          const from = Math.min(...g.tiers.map((x) => x.priceCents));
          return (
            <div key={g.name} className={open ? "tg open" : "tg"} style={g.color ? ({ "--sc": g.color } as React.CSSProperties) : undefined}>
              <button className="tg-h" type="button" aria-expanded={open} onClick={() => setOpenSecs((o) => ({ ...o, [g.name!]: !open }))}>
                <i className="sec-sw" style={{ background: g.color ?? "#111" }} aria-hidden="true" />
                <b className="tg-t">{g.name}</b>
                {sel > 0 && <i className="tg-n">{sel}</i>}
                <span className="tg-from">{from ? `a partir de ${brl(from)}` : "Grátis"}</span>
                <span className="tg-c" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
              </button>
              {/* sempre montado: a altura anima de 0 até o conteúdo (grid 0fr → 1fr) */}
              <div className="tg-bw" inert={!open}>
                <div className="tg-bi">
                  <div className="tg-b">{g.tiers.map((tier, i) => <TierRow key={tier.id} tier={tier} t={t} inGroup delay={i} showLimit={lim.perRow} />)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="cup">
        <label className="sr" htmlFor="cupom">Cupom de desconto</label>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" />
        </svg>
        <input
          id="cupom"
          type="text"
          placeholder="Cupom de desconto"
          value={t.couponInput}
          onChange={(ev) => t.setCouponInput(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); t.applyCoupon(); } }}
          autoComplete="off"
        />
        <button type="button" onClick={t.applyCoupon} disabled={t.checking}>{t.checking ? "..." : "Aplicar"}</button>
      </div>
      {t.couponMessage && <p className={t.couponMessage.cls} role="status">{t.couponMessage.text}</p>}
      <ResaleCard e={e} inline />
      <p className="note">Meia-entrada conforme a lei. A taxa de serviço já entra no total abaixo. Ingresso digital com QR code, em Meus ingressos.</p>
      </div>
      <div className="buy-ft">
      <div className="tot">
        {t.discount > 0 && t.coupon && (
          <div className="disc">
            <span>Desconto ({t.coupon.code})</span>
            <span>− {brl(t.discount)}</span>
          </div>
        )}
        {t.nq > 0 && !allFree && t.totalWithFee > t.total && (
          <div className="fee-l">
            <span>Taxa de serviço</span>
            <span>+ {brl(t.totalWithFee - t.total)}</span>
          </div>
        )}
        <div>
          <span>{t.qtyLabel}</span>
          <b>{allFree ? "Grátis" : brl(t.totalWithFee)}</b>
        </div>
        <button className="go" type="button" onClick={t.checkout} disabled={t.nq === 0 || t.pending}>
          {t.pending ? "Criando pedido…" : allFree ? "Garantir ingresso" : "Continuar"}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </button>
      </div>
      <button className="grp-b" type="button" onClick={t.group} disabled={t.nq < 2 || allFree || t.grouping || t.pending}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9.5" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4 4 0 0 1 6.5-3" /></svg>
        {t.grouping ? "Reservando…" : "Comprar em grupo"}
      </button>
      <span className="grp-s">{allFree ? "Ingresso grátis não precisa dividir: cada um garante o seu." : t.nq < 2 ? "Escolha 2 ou mais ingressos para dividir com os amigos." : "Reservamos por 60 min e cada um paga a sua parte pelo link."}</span>
      </div>
    </div>
  );
}

function TierRow({ tier, t, inGroup = false, delay, showLimit }: { tier: TierItem; t: Tickets; inGroup?: boolean; delay?: number; showLimit?: boolean }) {
  const q = t.qty[tier.id] ?? 0;
  const open = tier.status === "open" && tier.available > 0;
  const sold = tier.status === "sold_out" || tier.status === "closed" || (tier.status === "open" && tier.available === 0);
  const upcoming = tier.status === "upcoming";
  const cls = sold ? "tier so" : upcoming ? "tier up" : q > 0 ? "tier sel" : "tier";
  const label = tier.sector && !inGroup ? `${tier.sector} · ${tier.name}` : tier.name;
  // no limite o "+" fica apagado, mas o clique ainda explica o motivo
  const full = open && !t.canInc(tier.id);
  const owned = tier.owned ?? 0;
  return (
    <div className={cls} style={delay !== undefined ? ({ "--i": delay } as React.CSSProperties) : undefined}>
      <div className="tn">
        <b>{tier.sector && !inGroup && <i className="sec-sw" style={{ background: tier.sectorColor ?? "#111" }} aria-hidden="true" />}{label}</b>
        {tier.desc && <small className="tdesc">{tier.desc}</small>}
        <span className={tier.priceCents ? "pr" : "pr free"}>{price(tier.priceCents)}{showLimit && open && <small className="plim">Até {tier.limit} por pessoa</small>}{owned > 0 && <small className="plim">Você já tem {owned}</small>}</span>
      </div>
      {open && (
        <div className="qty">
          <button type="button" onClick={() => t.dec(tier.id)} aria-label={`Remover um ${tier.sector ? `${tier.sector} · ${tier.name}` : tier.name}`} disabled={q === 0}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M2.5 6h7" /></svg>
          </button>
          <span aria-live="polite">{q}</span>
          <button type="button" onClick={() => t.inc(tier.id)} aria-label={`Adicionar um ${tier.sector ? `${tier.sector} · ${tier.name}` : tier.name}`} aria-disabled={full || undefined}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 2.5v7M2.5 6h7" /></svg>
          </button>
        </div>
      )}
      {sold && <span className="soldt">{tier.status === "closed" ? "Encerrado" : "Esgotado"}</span>}
      {upcoming && <span className="soldt up">{tier.note ?? "Próxima virada de lote"}</span>}
    </div>
  );
}
