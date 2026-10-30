"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ART_FRAME_SRC } from "@/lib/art-frame";

/**
 * Iframe da arte em HTML (banner da home e prévias da central): abre o palco isolado com CSP própria e manda o HTML
 * por postMessage (ver src/lib/art-frame.ts). `active: false` descarrega a arte (a animação recomeça ao voltar);
 * HTML novo (edição na central) recarrega o palco.
 */
export function HtmlArtFrame({ html, active = true, title, className, style, width, height }: {
  html: string; active?: boolean; title: string; className?: string; style?: CSSProperties; width?: number; height?: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  // o palco avisa quando está pronto (pode carregar antes da hidratação, sem o onLoad do React); a resposta vai só
  // para o iframe deste componente
  useEffect(() => {
    if (!active) return;
    const on = (e: MessageEvent) => {
      const win = ref.current?.contentWindow;
      if (win && e.source === win && e.data?.twArtReady) win.postMessage({ twArt: html }, "*");
    };
    addEventListener("message", on);
    // já carregado antes deste efeito: manda agora (se ainda não for o palco, a mensagem se perde e o aviso chega depois)
    ref.current?.contentWindow?.postMessage({ twArt: html }, "*");
    return () => removeEventListener("message", on);
  }, [html, active]);
  return (
    <iframe
      key={active ? `a${html.length}:${hash(html)}` : "off"}
      ref={ref}
      title={title}
      src={active ? ART_FRAME_SRC : "about:blank"}
      onLoad={() => { if (active) ref.current?.contentWindow?.postMessage({ twArt: html }, "*"); }}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      tabIndex={-1}
      aria-hidden="true"
      className={className}
      style={style}
      width={width}
      height={height}
    />
  );
}

/** Marca curta do HTML (só para recarregar o palco quando a arte muda). */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
