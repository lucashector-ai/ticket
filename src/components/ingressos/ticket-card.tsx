"use client";

import { forwardRef } from "react";
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
  // navegador de dentro do Instagram/Facebook não baixa arquivo: no Android abre no Chrome; no iPhone, avisa
  function inApp(e: React.MouseEvent) {
    const ua = navigator.userAgent;
    if (!/Instagram|FBAN|FBAV|FB_IAB|Line\//i.test(ua)) return;
    e.preventDefault();
    if (/Android/i.test(ua)) {
      window.location.href = `intent://${window.location.host}${href}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    alert("Este navegador do app não deixa baixar arquivos. Toque nos três pontinhos (⋯) e escolha “Abrir no Safari” (ou no navegador), depois toque em Baixar PDF de novo.");
  }
  return <a className={className} href={href} download={`ingresso-${t.code}.pdf`} onClick={inApp}>{children}</a>;
}
