"use client";

import { useEffect } from "react";

/**
 * Imagem que não carregou (arquivo sumido, rede ruim) some da tela em vez de mostrar o ícone de imagem
 * quebrada: fica o fundo do lugar dela (cartaz listrado, avatar com iniciais, cor do banner).
 * Vale para todas as imagens do site.
 */
export function BrokenImages() {
  useEffect(() => {
    const hide = (img: HTMLImageElement) => { img.style.visibility = "hidden"; };
    // o evento de erro não sobe pela página: escuta na captura
    const onError = (ev: Event) => { if (ev.target instanceof HTMLImageElement) hide(ev.target); };
    window.addEventListener("error", onError, true);
    // as que falharam antes de o site ficar interativo
    for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) hide(img);
    return () => window.removeEventListener("error", onError, true);
  }, []);
  return null;
}
