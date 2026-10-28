"use client";

import Link from "next/link";
import { FlyerArt } from "@/components/art/flyer";
import { brl } from "@/lib/format";
import type { HomeEvent } from "./types";

type Props = {
  e: HomeEvent;
  /** Atraso da animação de entrada (ex.: "0.12s"). */
  delay?: string;
  /** Posição no ranking (Top 5). */
  rank?: number;
  /** Abre a visualização rápida. */
  onOpen?: (slug: string) => void;
  className?: string;
};

/** Card de evento no estilo da home (grade "Eventos em destaque" e Top 5). */
export function HomeCard({ e, delay, rank, onOpen, className = "card" }: Props) {
  const href = `/eventos/${e.slug}`;
  const label = rank ? `Número ${rank}: ver ingressos de ${e.title}` : `Ver ingressos de ${e.title}`;
  return (
    <article className={className} style={{ animationDelay: delay, border: "none", boxShadow: "none", outline: "none" }}>
      <div className="cimg" style={{ border: "none", boxShadow: "none" }}>
        <div className="in">
          <FlyerArt id={e.flyerId} />
        </div>
      </div>
      <div className="cbody">
        {rank ? (
          <div className="topt">
            <h3 className="ct">{e.title}</h3>
            <p className="cdate">{e.dateNice}</p>
            <p className="cwhere">{e.venue}<span className="ccity">{e.city}, {e.uf}</span></p>
          </div>
        ) : (
          <>
            <h3 className="ct">{e.title}</h3>
            <p className="cdate">{e.dateNice}</p>
            <p className="cwhere">{e.venue}<span className="ccity">{e.city}, {e.uf}</span></p>
          </>
        )}
        <div className="cfoot">
          <span className="cprice">A partir de <b>{brl(e.minPriceCents)}</b></span>
          {onOpen ? (
            <button className="cfx" type="button" style={{ zIndex: 3 }} onClick={() => onOpen(e.slug)} aria-label={`Visualização rápida de ${e.title}`}>
              <span className="cfx-l">Ver ingressos</span>
              <span className="cfx-a">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </span>
            </button>
          ) : (
            <span className="cfx" aria-hidden="true">
              <span className="cfx-l">Ver ingressos</span>
              <span className="cfx-a">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </span>
            </span>
          )}
        </div>
      </div>
      <Link className="open" href={href} aria-label={label} />
    </article>
  );
}

/** Esqueleto exibido na primeira carga da grade. */
export function SkeletonCard() {
  return (
    <div className="card sk" style={{ border: "none", boxShadow: "none", outline: "none" }}>
      <div className="cimg" style={{ border: "none", boxShadow: "none" }} />
      <div className="sk-l" style={{ width: "70%", height: 16 }} />
      <div className="sk-l" style={{ width: "50%" }} />
      <div className="sk-l" style={{ width: "60%", marginBottom: 12 }} />
    </div>
  );
}
