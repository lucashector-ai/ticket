"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tabela do painel (`.tbl`). No celular ela rola de lado; quando rola de fato, entra no Tab para quem usa
 * teclado rolar com as setas (WCAG 2.1.1, axe `scrollable-region-focusable`), com o nome da tabela
 * para o leitor de tela. Sem rolagem, não cria parada de Tab à toa.
 */
export function Tbl({ label, children, ...rest }: { label: string } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  // confere ao montar, quando a largura muda e quando as linhas mudam (busca, filtros)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true });
    return () => { ro?.disconnect(); mo.disconnect(); };
  }, []);
  return (
    <div ref={ref} className="tbl" role="group" aria-label={label} tabIndex={scrolls ? 0 : undefined} {...rest}>
      {children}
    </div>
  );
}
