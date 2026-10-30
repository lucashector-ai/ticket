"use client";

import { useEffect } from "react";

/**
 * Imagem que não carregou (arquivo sumido, rede ruim) some da tela em vez de mostrar o ícone de imagem
 * quebrada: fica o fundo do lugar dela (cartaz listrado, avatar com iniciais, cor do banner).
 * Vale para todas as imagens do site.
 */
export function BrokenImages() {
  useEffect(() => {
    // esconde pela folha de estilo (img[src="…"]), sem mexer no elemento: mudar o style da <img> antes de um bloco
    // em Suspense hidratar gera aviso de "hydration mismatch" (visto no /explorar)
    const seen = new Set<string>();
    let sheet: HTMLStyleElement | null = null;
    const hide = (img: HTMLImageElement) => {
      const src = img.getAttribute("src");
      if (!src || seen.has(src)) return;
      seen.add(src);
      if (!sheet) { sheet = document.createElement("style"); sheet.id = "tw-broken-img"; document.head.appendChild(sheet); }
      sheet.textContent += `img[src="${CSS.escape(src)}"]{visibility:hidden}`;
    };
    // o evento de erro não sobe pela página: escuta na captura
    const onError = (ev: Event) => { if (ev.target instanceof HTMLImageElement) hide(ev.target); };
    window.addEventListener("error", onError, true);
    // as que falharam antes de o site ficar interativo
    for (const img of Array.from(document.images)) if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) hide(img);
    return () => window.removeEventListener("error", onError, true);
  }, []);
  return null;
}
