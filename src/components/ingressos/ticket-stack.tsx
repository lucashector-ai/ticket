"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Vários ingressos do mesmo evento: os outros ficam atrás, como folhas empilhadas e levemente tortas,
 * com o número e o titular aparecendo na borda. Tocar num de trás traz ele para a frente.
 */
export function TicketStack({ total, cur, labels, onPick, children }: {
  total: number;
  cur: number;
  /** titular de cada ingresso (mesma ordem) */
  labels: (string | null)[];
  onPick: (i: number) => void;
  children: ReactNode;
}) {
  if (total < 2) return <>{children}</>;
  // os próximos da fila ficam atrás (até dois visíveis)
  const backs = Array.from({ length: Math.min(2, total - 1) }, (_, k) => (cur + k + 1) % total);
  return (
    <div className={`tks k${backs.length}`}>
      {[...backs].reverse().map((i) => {
        const k = backs.indexOf(i) + 1;
        return (
          <button key={i} type="button" className={`tks-b b${k}`} style={{ "--k": k } as CSSProperties} onClick={() => onPick(i)} aria-label={`Ver ingresso ${i + 1} de ${total}${labels[i] ? `, de ${labels[i]}` : ""}`}>
            <span className="tks-l"><b>Ingresso {i + 1} de {total}</b>{labels[i] && <small>{labels[i]}</small>}<em>Ver</em></span>
          </button>
        );
      })}
      <div className="tks-f" key={cur}>{children}</div>
    </div>
  );
}
