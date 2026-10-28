"use client";

import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { createCheckinLink, revokeCheckinLink } from "@/lib/actions/painel";
import { useOrigin } from "./use-origin";

export type CheckinLink = { id: string; label: string; token: string; scans: number; used: string | null };

/** Links externos de check-in: cada um abre a tela de leitura no celular de quem estiver na portaria, sem conta. */
export function CheckinLinks({ eventId, links: links0 }: { eventId: string; links: CheckinLink[] }) {
  const { flash } = useToast();
  const origin = useOrigin();
  const [links, setLinks] = useState(links0);
  const [label, setLabel] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const urlOf = (l: CheckinLink) => `${origin}/checkin/${l.token}`;

  const create = () => start(async () => {
    const name = label.trim() || `Portaria ${links.length + 1}`;
    const r = await createCheckinLink(eventId, name);
    if (!r.ok) { flash(r.error); return; }
    const l = { id: r.id, label: name, token: r.token, scans: 0, used: null };
    setLinks((x) => [...x, l]);
    setLabel("");
    setQr(r.id);
    // a cópia fica fora da transição: o navegador pode demorar a responder e o botão não deve travar
    setTimeout(() => { navigator.clipboard.writeText(urlOf(l)).then(() => flash("Link criado e copiado."), () => flash("Link criado.")); }, 0);
  });
  const revoke = (l: CheckinLink) => start(async () => {
    const r = await revokeCheckinLink(l.id);
    if (!r.ok) { flash(r.error); return; }
    setLinks((x) => x.filter((y) => y.id !== l.id));
    flash(`“${l.label}” desligado. Quem estava com o link não consegue mais validar.`);
  });
  async function copy(l: CheckinLink) {
    try { await navigator.clipboard.writeText(urlOf(l)); flash("Link copiado."); } catch { flash("Não foi possível copiar."); }
  }

  return (
    <section className="cx cl">
      <div className="cl-h">
        <span className="cl-ic" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 18.5h4" /><path d="M9.5 8.5h5v5h-5z" /></svg>
        </span>
        <div><h2 className="card-t">Check-in pelo celular</h2><span className="card-s">Crie um link para cada portão ou pessoa da equipe. Ele abre a tela de leitura no celular, sem precisar de conta. Cada QR code só vale uma vez.</span></div>
      </div>
      <form className="cl-new" onSubmit={(e) => { e.preventDefault(); if (!busy) create(); }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Nome do link: Portão A, Camarote, Maria…" aria-label="Nome do link de check-in" />
        <button className="b2 dark" type="submit" disabled={busy}>{busy ? "Criando…" : "Criar link"}</button>
      </form>
      {links.length > 0 && (
        <div className="cl-list">
          {links.map((l) => (
            <div className="cl-row" key={l.id}>
              <div className="cl-top">
                <span className="cl-dot" aria-hidden="true" />
                <div className="cl-i"><b>{l.label}</b><span>{l.scans} {l.scans === 1 ? "entrada" : "entradas"}{l.used ? ` · usado ${l.used}` : " · ainda não usado"}</span></div>
                <button className={qr === l.id ? "cl-b on" : "cl-b"} type="button" onClick={() => setQr(qr === l.id ? null : l.id)} aria-expanded={qr === l.id}>QR</button>
                <button className="cl-b" type="button" onClick={() => void copy(l)}>Copiar</button>
                <a className="cl-b" href={urlOf(l)} target="_blank" rel="noreferrer">Abrir</a>
                <button className="cl-b danger" type="button" onClick={() => revoke(l)} disabled={busy}>Desligar</button>
              </div>
              {qr === l.id && <LinkQr url={urlOf(l)} />}
            </div>
          ))}
        </div>
      )}
      <p className="cl-note">Quem tiver o link consegue validar entradas: mande só para a sua equipe. Se o link vazar, desligue e crie outro.</p>
    </section>
  );
}

/** QR do link, para a equipe abrir apontando a câmera do celular para a tela do computador. */
function LinkQr({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    if (url) void QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [url]);
  return (
    <div className="cl-qr">
      <span className="cl-qr-c" role="img" aria-label="QR code do link de check-in" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="cl-qr-i"><b>Aponte a câmera do celular</b><span>O link abre direto na tela de check-in.</span><code>{url.replace(/^https?:\/\//, "")}</code></div>
    </div>
  );
}
