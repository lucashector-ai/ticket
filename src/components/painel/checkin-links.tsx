"use client";

import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { createCheckinLink, revokeCheckinLink, sendCheckinLink } from "@/lib/actions/painel";
import { useOrigin } from "./use-origin";

/** `sent`/`opened`/`used`: "há 2 min" (rastreio do acesso) */
export type CheckinLink = { id: string; label: string; token: string; code: string; email: string | null; sent: string | null; opened: string | null; scans: number; used: string | null };

/**
 * Portaria do evento: cada pessoa ganha um acesso único e secreto (link + código) ao app da portaria.
 * Duas formas de entregar: mostrar o QR code na tela (a pessoa aponta o celular na hora) ou mandar por e-mail.
 * Cada acesso mostra se já foi aberto, quantas entradas validou e quando foi usado.
 */
export function CheckinLinks({ eventId, links: links0 }: { eventId: string; links: CheckinLink[] }) {
  const { flash } = useToast();
  const origin = useOrigin();
  const [links, setLinks] = useState(links0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const urlOf = (l: CheckinLink) => `${origin}/portaria/entrar/${l.token}`;
  const appUrl = `${origin.replace(/^https?:\/\//, "")}/portaria`;

  const create = (send: boolean) => start(async () => {
    const label = name.trim() || `Portaria ${links.length + 1}`;
    const r = await createCheckinLink(eventId, label, email, send);
    if (!r.ok) { flash(r.error); return; }
    const l: CheckinLink = { id: r.id, label, token: r.token, code: r.code, email: r.email, sent: r.sent ? "agora" : null, opened: null, scans: 0, used: null };
    setLinks((x) => [...x, l]);
    setName(""); setEmail("");
    if (send) flash(r.sent ? `Acesso enviado para ${r.email}.` : "Acesso criado, mas o e-mail não saiu. Use o QR code ou tente enviar de novo.");
    else { setQr(r.id); flash(`Acesso de ${label} criado: peça para apontar a câmera para o QR code.`); }
  });
  const send = (l: CheckinLink) => {
    const to = window.prompt(`Enviar o acesso de ${l.label} para qual e-mail?`, l.email ?? "");
    if (!to) return;
    start(async () => {
      const r = await sendCheckinLink(l.id, to);
      if (!r.ok) { flash(r.error); return; }
      setLinks((x) => x.map((y) => (y.id === l.id ? { ...y, email: r.email, sent: "agora" } : y)));
      flash(`Acesso enviado para ${r.email}.`);
    });
  };
  /** "Desligar" pede um segundo toque (o acesso cai na hora e não volta) */
  const [arm, setArm] = useState<string | null>(null);
  useEffect(() => {
    if (!arm) return;
    const id = setTimeout(() => setArm(null), 5000);
    return () => clearTimeout(id);
  }, [arm]);
  const revoke = (l: CheckinLink) => start(async () => {
    const r = await revokeCheckinLink(l.id);
    if (!r.ok) { flash(r.error); return; }
    setLinks((x) => x.filter((y) => y.id !== l.id));
    flash(`Acesso de ${l.label} desligado. Quem estava conectado sai na hora.`);
  });
  async function copy(l: CheckinLink) {
    try { await navigator.clipboard.writeText(urlOf(l)); flash("Link copiado."); } catch { flash("Não foi possível copiar."); }
  }

  return (
    <section className="cx cl">
      <div className="cl-h">
        <span className="cl-ic" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><rect x="9" y="7" width="6" height="6" rx="1" /><path d="M10.5 17.5h3" /></svg>
        </span>
        <div><h2 className="card-t">Convidar para a portaria</h2><span className="card-s">Cada pessoa da portaria ganha um acesso só dela a este evento, no app da portaria (<b>{appUrl}</b>). Mostre o QR code para ela apontar o celular agora, ou mande o link por e-mail. Você vê quando ela abriu e quantas entradas validou.</span></div>
      </div>
      <form className="cl-new" onSubmit={(e) => { e.preventDefault(); if (!busy) create(!!email.trim()); }}>
        <input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nome: Maria, Portão A…" aria-label="Nome da pessoa ou do portão" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="E-mail (para enviar o acesso)" aria-label="E-mail da pessoa" autoComplete="off" />
        <button className="b2" type="button" disabled={busy} onClick={() => create(false)}>{busy ? "Criando…" : "Mostrar QR code"}</button>
        <button className="b2 dark" type="button" disabled={busy || !email.trim()} onClick={() => create(true)} title={email.trim() ? undefined : "Digite o e-mail"}>Enviar por e-mail</button>
      </form>
      {links.length > 0 && (
        <div className="cl-list">
          {links.map((l) => (
            <div className="cl-row" key={l.id}>
              <div className="cl-top">
                <span className={l.opened ? "cl-dot" : "cl-dot off"} aria-hidden="true" />
                <div className="cl-i">
                  <b>{l.label}{l.code && <code className="cl-code">{l.code}</code>}</b>
                  <span>{[
                    l.email ? (l.sent ? `enviado para ${l.email}` : l.email) : null,
                    l.opened ? `aberto ${l.opened}` : "ainda não aberto",
                    `${l.scans} ${l.scans === 1 ? "entrada" : "entradas"}`,
                    l.used ? `usado ${l.used}` : null,
                  ].filter(Boolean).join(" · ")}</span>
                </div>
                <button className={qr === l.id ? "cl-b on" : "cl-b"} type="button" onClick={() => setQr(qr === l.id ? null : l.id)} aria-expanded={qr === l.id}>QR code</button>
                <button className="cl-b" type="button" onClick={() => send(l)} disabled={busy}>{l.sent ? "Reenviar" : "Enviar por e-mail"}</button>
                <button className="cl-b" type="button" onClick={() => void copy(l)}>Copiar link</button>
                <button className={arm === l.id ? "cl-b danger on" : "cl-b danger"} type="button" onClick={() => { if (arm === l.id) { setArm(null); revoke(l); } else setArm(l.id); }} disabled={busy}>{arm === l.id ? "Confirmar: desligar" : "Desligar"}</button>
              </div>
              {qr === l.id && <LinkQr url={urlOf(l)} name={l.label} />}
            </div>
          ))}
        </div>
      )}
      <p className="cl-note">O link e o código são secretos e pessoais: quem tiver consegue validar entradas e ver a lista de nomes. Se vazar, desligue e crie outro; quem estava conectado sai na hora.</p>
    </section>
  );
}

/** QR do link, para a pessoa da portaria abrir apontando a câmera do celular para a tela. */
function LinkQr({ url, name }: { url: string; name: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    if (url) void QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [url]);
  return (
    <div className="cl-qr">
      <span className="cl-qr-c" role="img" aria-label={`QR code do acesso de ${name}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="cl-qr-i"><b>{name}: aponte a câmera do celular</b><span>Abre o app da portaria já conectado a este acesso. Depois dá para adicionar à tela de início.</span><code>{url.replace(/^https?:\/\//, "")}</code></div>
    </div>
  );
}
