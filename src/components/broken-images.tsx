"use client";

import { useEffect } from "react";

/**
 * Imagem que não carregou (arquivo sumido, rede ruim) some da tela em vez de mostrar o ícone de imagem
 * quebrada: fica o fundo do lugar dela (cartaz listrado, avatar com iniciais, cor do banner).
 * Vale para todas as imagens do site.
 */
export function BrokenImages() {
  useEffect(() => {
    // espera a página terminar de hidratar: mexer no estilo antes disso gera aviso de "hydration mismatch"
    const later = (fn: () => void) => {
      const run = () => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 300); };
      if (document.readyState === "complete") run(); else window.addEventListener("load", run, { once: true });
    };
    const hide = (img: HTMLImageElement) => later(() => { img.style.visibility = "hidden"; });
    // o evento de erro não sobe pela página: escuta na captura
    const onError = (ev: Event) => { if (ev.target instanceof HTMLImageElement) hide(ev.target); };
    window.addEventListener("error", onError, true);
    // as que falharam antes de o site ficar interativo
    later(() => { for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) img.style.visibility = "hidden"; });
    return () => window.removeEventListener("error", onError, true);
  }, []);
  return null;
}
