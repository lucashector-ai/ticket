"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useFavorites } from "@/components/favorites";
import { useToast } from "@/components/toast";
import { brl, popLabel } from "@/lib/format";
import type { HomeEvent } from "./types";

/** Visualização rápida do evento (flyer, dados, lineup e lotes) com CTA para a página do evento. */
export function QuickView({ e, onClose }: { e: HomeEvent; onClose: () => void }) {
  const { isFav, toggle } = useFavorites();
  const { flash } = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fav = isFav(e.slug);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tiers = e.tiers;
  const open = tiers.filter((t) => t.status === "open");
  const from = open.length ? Math.min(...open.map((t) => t.priceCents)) : e.minPriceCents;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <button className="scrim" type="button" onClick={onClose} aria-label="Fechar" />
      <div className="sheet">
        <button ref={closeRef} className="mx" type="button" onClick={onClose} aria-label="Fechar detalhes">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="m-media">
          <div><FlyerArt id={e.flyerId} /></div>
        </div>
        <div className="m-body">
          <span className="m-tag">{e.categoryLabel}</span>
          <h2 className="m-h" id="m-title">{e.title}</h2>
          <div className="m-info">
            <div><span>Quando</span><b>{e.dateNice}</b></div>
            <div><span>Onde</span><b>{e.venue}</b></div>
            <div><span>Cidade</span><b>{e.city}, {e.uf}</b></div>
            <div><span>Interesse</span><b>{popLabel(e.popularity)} pessoas salvaram</b></div>
          </div>
          {e.description && <p className="m-desc">{e.description}</p>}
          {e.lineup.length > 0 && (
            <div className="m-line">
              {e.lineup.map((l) => <span key={l}>{l}</span>)}
            </div>
          )}
          {tiers.length > 0 && (
            <>
              <p className="m-lbl">Ingressos</p>
              <div className="tiers">
                {tiers.map((t) => (
                  <div key={t.name} className={t.status === "sold_out" ? "tier so" : "tier"}>
                    <div>
                      <b>{t.name}</b>
                      {t.note && <small>{t.note}</small>}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{brl(t.priceCents)}</span>
                    {t.status === "sold_out" ? (
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Esgotado</span>
                    ) : t.status === "upcoming" ? (
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#6E6E73" }}>Em breve</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#6E6E73" }}>Disponível</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="m-tot">
            <div>
              <span>A partir de</span>
              <b>{brl(from)}</b>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="btn-g"
                style={{ width: 52, padding: 0, justifyContent: "center" }}
                type="button"
                aria-pressed={fav}
                aria-label={fav ? "Remover dos salvos" : "Salvar evento"}
                onClick={async () => { const saved = await toggle(e.slug); flash(saved ? `${e.title} foi salvo` : "Removido dos salvos"); }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8 3.1c0 6.1-8 11-8 11z" />
                </svg>
              </button>
              <Link className="btn-p" href={`/eventos/${e.slug}`}>
                Ver ingressos
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </Link>
            </div>
          </div>
          <p className="m-note">Meia-entrada conforme a lei. A taxa de serviço aparece no checkout, antes do pagamento.</p>
        </div>
      </div>
    </div>
  );
}
