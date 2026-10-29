"use client";

import { forwardRef, useRef, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { BrandMark, BrandWord } from "@/components/brand-logo";
import type { TicketCardData } from "@/lib/tickets/card";
import { FONTS } from "@/lib/fonts";

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
 * CSS das fontes com os arquivos embutidos (só o alfabeto latino), para a "foto" do ingresso sair com as
 * fontes do site: o gerador não consegue ler a folha do Google Fonts sozinho.
 */
let fontCss: Promise<string> | null = null;
function embeddedFonts() {
  fontCss ??= (async () => {
    const css = await (await fetch(FONTS)).text();
    const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* latin \*\//.test(b));
    const files = new Map<string, Promise<string>>();
    const dataUrl = (url: string) => {
      if (!files.has(url)) files.set(url, fetch(url).then((r) => r.blob()).then((b) => new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); })));
      return files.get(url)!;
    };
    const out = await Promise.all(blocks.map(async (b) => {
      const m = b.match(/url\((https:[^)]+)\)/);
      return m ? b.replace(m[1], await dataUrl(m[1])) : b;
    }));
    return out.join("\n");
  })().catch(() => { fontCss = null; return ""; });
  return fontCss;
}

/** Baixa o ingresso em PDF: desenha o cartão fora da tela, vira imagem e monta o PDF no próprio aparelho. */
export function TicketPdfButton({ t, qrSvg, className, children }: { t: TicketCardData; qrSvg: string; className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  async function make() {
    if (busy) return;
    setBusy(true);
    setShow(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts?.ready;
      const node = card.current;
      if (!node) throw new Error("card");
      // imagens do cartaz precisam ter carregado antes de virar foto
      await Promise.all(Array.from(node.querySelectorAll("img")).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
      const [{ toJpeg }, { jsPDF }, fontEmbedCSS] = await Promise.all([import("html-to-image"), import("jspdf"), embeddedFonts()]);
      const img = await toJpeg(node, { pixelRatio: 2.5, quality: 0.9, backgroundColor: "#111111", cacheBust: true, fontEmbedCSS: fontEmbedCSS || undefined });
      const w = node.offsetWidth, h = node.offsetHeight;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [w, h], hotfixes: ["px_scaling"], compress: true });
      pdf.addImage(img, "JPEG", 0, 0, w, h);
      pdf.save(`ingresso-${t.code}.pdf`);
    } catch (e) {
      console.error("pdf", e);
      alert("Não foi possível gerar o PDF agora. Tente de novo.");
    } finally {
      setShow(false);
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} type="button" onClick={() => void make()} disabled={busy} aria-busy={busy}>{busy ? "Gerando PDF…" : children}</button>
      {show && <div className="tcard-stage" aria-hidden="true"><TicketCard ref={card} t={t} qrSvg={qrSvg} /></div>}
    </>
  );
}
