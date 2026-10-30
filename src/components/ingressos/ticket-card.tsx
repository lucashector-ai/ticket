"use client";

import { forwardRef, useEffect, useRef } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { BrandMark, BrandWord } from "@/components/brand-logo";
import type { TicketCardData } from "@/lib/tickets/card";

/** O ingresso "de papel" (modelo do PDF): arte, dados do evento, picote e QR code. */
export const TicketCard = forwardRef<HTMLDivElement, { t: TicketCardData; qrSvg: string }>(function TicketCard({ t, qrSvg }, ref) {
  const foot = [t.holder, t.orderNumber != null ? `Pedido #${t.orderNumber}` : null, t.age].filter(Boolean);
  return (
    <div className="tcard" ref={ref}>
      <div className="tc-paper">
        <div className="tc-art">
          <FlyerArt id={t.flyerId} />
          <span className={t.valid ? "tc-chip" : "tc-chip off"}><i aria-hidden="true" />{t.valid ? "Ingresso válido" : "Ingresso não válido"}</span>
        </div>
        <div className="tc-info">
          {t.presenter && <span className="tc-pre">{t.presenter} apresenta</span>}
          <b className="tc-title">{t.title}</b>
          <span className="tc-date">{t.dateLine}</span>
          <span className="tc-place">{t.placeLine}</span>
          <div className="tc-grid">
            <div><span>Portões</span><b>{t.gates}</b></div>
            <div><span>Setor</span><b>{t.sector}</b></div>
            <div><span>Tipo</span><b>{t.type}</b></div>
          </div>
        </div>
        <div className="tc-cut" aria-hidden="true"><i /><span /><i /></div>
        <div className="tc-qr">
          <div className="tc-qrbox" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <span className="tc-code">{t.code}</span>
          <span className="tc-foot">{foot.map((x, i) => <span key={x}>{i === 0 && t.holder ? <b>{x}</b> : x}</span>)}</span>
          <span className="tc-logo" aria-label="Tickets Win"><BrandMark size={20} /><BrandWord height={13} /></span>
        </div>
      </div>
    </div>
  );
});

/**
 * Baixa o ingresso em PDF. O PDF é gerado no servidor (/api/ingressos/[código]/pdf): montar no aparelho falhava
 * no Safari do iPhone e nos navegadores do WhatsApp/Instagram. O servidor entrega como download: clicou, baixou.
 */
export function TicketPdfButton({ t, className, children }: { t: TicketCardData; qrSvg?: string; className?: string; children: React.ReactNode }) {
  const href = `/api/ingressos/${encodeURIComponent(t.code)}/pdf`;
  const name = `ingresso-${t.code}.pdf`;
  const ref = useRef<HTMLAnchorElement>(null);
  const blob = useRef<Blob | null>(null);

  // iPhone/iPad: link do servidor sempre pergunta ou abre a visualização. Com o arquivo já no aparelho,
  // o toque salva direto em Arquivos › Downloads. Busca o PDF quando o botão aparece na tela.
  useEffect(() => {
    const el = ref.current;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!el || !ios || IN_APP.test(navigator.userAgent)) return;
    let done = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting || done) return;
      done = true;
      io.disconnect();
      void fetch(href, { credentials: "same-origin" })
        .then((r) => (r.ok && r.headers.get("content-type")?.includes("pdf") ? r.blob() : null))
        .then((b) => { blob.current = b; })
        .catch(() => {});
    });
    io.observe(el);
    return () => io.disconnect();
  }, [href]);

  function click(e: React.MouseEvent) {
    const ua = navigator.userAgent;
    // navegador de dentro do Instagram/Facebook não baixa arquivo: no Android abre no Chrome; no iPhone, avisa
    if (IN_APP.test(ua)) {
      e.preventDefault();
      if (/Android/i.test(ua)) { window.location.href = `intent://${window.location.host}${href}#Intent;scheme=https;package=com.android.chrome;end`; return; }
      alert("Este navegador do app não deixa baixar arquivos. Toque nos três pontinhos (⋯) e escolha “Abrir no Safari” (ou no navegador), depois toque em Baixar PDF de novo.");
      return;
    }
    if (!blob.current) return; // ainda não chegou: segue o link normal
    e.preventDefault();
    const url = URL.createObjectURL(new File([blob.current], name, { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return <a ref={ref} className={className} href={href} download={name} onClick={click}>{children}</a>;
}

const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\//i;
