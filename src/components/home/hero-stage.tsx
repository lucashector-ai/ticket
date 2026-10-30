"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Arte de palco fixo (HTML ou imagem feitos num tamanho de projeto, ex.: 1440 × 800) dentro de um espaço de outro
 * formato. A arte é renderizada no tamanho de projeto (o HTML enxerga uma janela de w × h, como no arquivo original)
 * e escalada inteira para caber; as sobras ficam com a cor de fundo da arte. Nada dentro da arte é alterado.
 *
 * O CSS de quem envolve escolhe o encaixe pelo próprio elemento (`.bnf-box`):
 * - `--bnf-fit: contain` (padrão): a arte inteira, centralizada;
 * - `--bnf-fit: width`: preenche a largura (computador). Corta no máximo 10% em cima e embaixo, que nas artes de
 *   palco é fundo; se precisasse cortar mais, encolhe e sobra cor nas laterais. Assim o texto nunca é cortado;
 * - `--bnf-top`/`--bnf-bot` (px): faixas cobertas por cima (cabeçalho, busca); a arte centraliza no meio do resto.
 *
 * O HTML roda num iframe isolado (sandbox sem allow-same-origin: sem cookies, sem a conta, sem navegar o site) e
 * sem receber cliques: o link fica por fora, no carrossel. `active`: só o slide visível carrega o HTML (e a
 * animação recomeça quando ele volta). Movimento reduzido: vale o que a própria arte fizer com
 * prefers-reduced-motion (o iframe herda a preferência); não forçamos nada dentro dela.
 */
export function HeroStage({ html, image, w, h, bg, active, title, className, style }: {
  html: string | null; image: string | null; w: number; h: number; bg: string; active: boolean; title: string;
  className?: string; style?: CSSProperties;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ s: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const calc = () => {
      // clientWidth/Height: tamanho do layout, sem efeito de transform (zoom de entrada do carrossel)
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      const cs = getComputedStyle(el);
      const mode = cs.getPropertyValue("--bnf-fit").trim();
      const top = parseFloat(cs.getPropertyValue("--bnf-top")) || 0;
      const bot = parseFloat(cs.getPropertyValue("--bnf-bot")) || 0;
      const s = mode === "width" ? Math.min(cw / w, ch / (h * 0.8)) : Math.min(cw / w, ch / h);
      const aw = w * s, ah = h * s;
      const cy = top + Math.max(0, ch - top - bot) / 2;
      let y = cy - ah / 2;
      // arte menor que o espaço: nunca sai dele; maior (corte de até 10%): nunca deixa faixa vazia
      y = ah <= ch ? Math.min(Math.max(y, 0), ch - ah) : Math.max(Math.min(y, 0), ch - ah);
      setFit({ s, x: (cw - aw) / 2, y });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  return (
    <span ref={box} className={className ? `bnf-box ${className}` : "bnf-box"} style={{ ...style, background: bg }} aria-hidden="true">
      <span
        className="bnf-art"
        style={{ width: w, height: h, transform: fit ? `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` : undefined, visibility: fit ? undefined : "hidden" }}
      >
        {html ? (
          <iframe
            title={title}
            srcDoc={active ? html : undefined}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            tabIndex={-1}
            width={w}
            height={h}
            style={{ display: "block", width: w, height: h, border: 0, pointerEvents: "none", background: bg }}
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={w} height={h} decoding="async" style={{ display: "block", width: w, height: h }} />
        ) : null}
      </span>
    </span>
  );
}
