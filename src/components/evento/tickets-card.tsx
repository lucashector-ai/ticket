"use client";

import { brl } from "@/lib/format";
import type { EventoData } from "./types";
import type { Tickets } from "./use-tickets";

export function TicketsCard({ e, t }: { e: EventoData; t: Tickets }) {
  return (
    <div className="buy" id="ingressos">
      <div className="buy-h">
        <h2>Ingressos</h2>
        <span className="mute" style={{ fontSize: 13 }}>Até {e.maxPerOrder} por pessoa</span>
      </div>
      {e.minPriceCents > 0 && <p className="from">A partir de <b>{brl(e.minPriceCents)}</b></p>}
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
        {t.visibleTiers.map((tier) => {
          const q = t.qty[tier.id] ?? 0;
          const open = tier.status === "open" && tier.available > 0;
          const sold = tier.status === "sold_out" || tier.status === "closed" || (tier.status === "open" && tier.available === 0);
          const upcoming = tier.status === "upcoming";
          const cls = sold ? "tier so" : upcoming ? "tier up" : q > 0 ? "tier sel" : "tier";
          const label = tier.sector ? `${tier.sector} · ${tier.name}` : tier.name;
          return (
            <div className={cls} key={tier.id}>
              <div className="tn">
                <b>{tier.sector && <i className="sec-sw" style={{ background: tier.sectorColor ?? "#111" }} aria-hidden="true" />}{label}</b>
                {tier.desc && <small className="tdesc">{tier.desc}</small>}
                <span className="pr">{brl(tier.priceCents)}</span>
              </div>
              {open && (
                <div className="qty">
                  <button type="button" onClick={() => t.dec(tier.id)} aria-label={`Remover um ${label}`} disabled={q === 0}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M2.5 6h7" /></svg>
                  </button>
                  <span aria-live="polite">{q}</span>
                  <button type="button" onClick={() => t.inc(tier.id)} aria-label={`Adicionar um ${label}`}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 2.5v7M2.5 6h7" /></svg>
                  </button>
                </div>
              )}
              {sold && <span className="soldt">Encerrado</span>}
              {upcoming && <span className="soldt up">{tier.note ?? "Próxima virada de lote"}</span>}
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
      <div className="tot">
        {t.discount > 0 && t.coupon && (
          <div className="disc">
            <span>Desconto ({t.coupon.code})</span>
            <span>− {brl(t.discount)}</span>
          </div>
        )}
        <div>
          <span>{t.qtyLabel}</span>
          <b>{brl(t.total)}</b>
        </div>
        <button className="go" type="button" onClick={t.checkout} disabled={t.nq === 0 || t.pending}>
          {t.pending ? "Criando pedido…" : "Continuar para pagamento"}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </button>
      </div>
      <p className="note">Meia-entrada conforme a lei. A taxa de serviço aparece antes do pagamento. Ingresso digital no app, com QR code.</p>
    </div>
  );
}
