"use client";

import { useState } from "react";
import { SnapRail } from "./motion";

const TIPS = [
  { tag: "Seu evento", t: "Como montar lotes que esgotam sem baixar o preço", m: "Dica · 1 min", tone: "", back: "Comece com um lote promocional pequeno, de 10 a 15% da lotação, e programe a virada por quantidade e por data. Escassez de verdade vende mais do que desconto." },
  { tag: "Marketing e vendas", t: "Promoters: quanto pagar e como acompanhar cada venda", m: "Dica · 1 min", tone: "lime", back: "Dê a cada promoter um link ou cupom próprio e pague por venda confirmada, não por convite. O painel mostra quem vendeu o quê em tempo real." },
  { tag: "Mercado", t: "Meia-entrada social: o que é e como precificar", m: "Dica · 1 min", tone: "", back: "A meia social fica entre a meia e a inteira, em troca de doação ou alimento. A gente sugere um valor, mas o preço final é sempre seu." },
  { tag: "Funcionalidades", t: "Do rascunho ao mapa 3D em 5 minutos", m: "Passo a passo · 1 min", tone: "ink", back: "Fotografe o desenho do espaço, confira os setores que a IA encontrou, ajuste as capacidades e publique. O público escolhe o lugar vendo o palco." },
];

/** Cards de dica que viram (flip 3D) ao clicar/tocar. */
export function Tips() {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <SnapRail className="pdl-blog" count={TIPS.length} label="Dicas">
      {TIPS.map((c, i) => {
        const o = open.has(i);
        return (
          <button
            key={c.t}
            type="button"
            className={`pdl-bc pdl-rv ${c.tone}${o ? " flip" : ""}`}
            style={{ "--i": i } as React.CSSProperties}
            aria-pressed={o}
            onClick={() => toggle(i)}
          >
            <span className="pdl-bcf">
              <span className="tg">{c.tag}</span>
              <b>{c.t}</b>
              <span className="mt">
                {c.m}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" /></svg>
              </span>
            </span>
            <span className="pdl-bcb" aria-hidden={!o}>
              <span className="tg">{c.tag}</span>
              <span className="tx">{c.back}</span>
              <span className="mt">Voltar</span>
            </span>
          </button>
        );
      })}
    </SnapRail>
  );
}
