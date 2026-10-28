"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { BrandLogo } from "@/components/brand-logo";
import { linkCounts, scanWithLink } from "@/lib/actions/checkin-link";
import { useQrCamera } from "./use-qr-camera";

type Shot = { id: number; kind: "ok" | "used" | "no"; title: string; sub: string; at: string };
type Props = {
  token: string;
  off?: boolean;
  gate?: string;
  event?: { title: string; flyerId: string; when: string };
  total?: number;
  inside?: number;
};

const hm = (d = new Date()) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const n = (v: number) => v.toLocaleString("pt-BR");

/** Leitor da portaria aberto pelo link externo: câmera + código digitado, contador ao vivo e as leituras deste aparelho. */
export function CheckinApp({ token, off: off0 = false, gate, event, total: total0 = 0, inside: inside0 = 0 }: Props) {
  const busy = useRef(false);
  const seq = useRef(0);
  const [off, setOff] = useState(off0);
  const [cam, setCam] = useState<"off" | "on" | "erro">("off");
  const [counts, setCounts] = useState({ inside: inside0, total: total0 });
  const [result, setResult] = useState<Shot | null>(null);
  const [log, setLog] = useState<Shot[]>([]);
  const [code, setCode] = useState("");

  const check = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const r = await scanWithLink(token, text).catch(() => ({ ok: false, error: "Sem conexão. Tente de novo.", off: false, ticket: undefined, inside: undefined, total: undefined, checkedInAt: null }));
    if (r.off) { setOff(true); busy.current = false; return; }
    const t = r.ticket;
    const used = !r.ok && /utilizado/.test(r.error ?? "");
    const shot: Shot = {
      id: ++seq.current, kind: r.ok ? "ok" : used ? "used" : "no",
      title: r.ok ? (t?.holderName || "Entrada liberada") : (r.error ?? "Não foi possível validar"),
      sub: r.ok
        ? [t?.sector, t?.ticketType].filter(Boolean).join(" · ")
        : used && r.checkedInAt ? `Entrou às ${hm(new Date(r.checkedInAt))}${t?.holderName ? ` · ${t.holderName}` : ""}` : t ? [t.holderName, t.ticketType].filter(Boolean).join(" · ") : "",
      at: hm(),
    };
    if (r.inside !== undefined && r.total !== undefined) setCounts({ inside: r.inside, total: r.total });
    try { navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]); } catch { /* sem vibração */ }
    setResult(shot);
    setLog((l) => [shot, ...l].slice(0, 40));
    setTimeout(() => { setResult(null); busy.current = false; }, r.ok ? 1300 : 2600);
  }, [token]);

  const camError = useCallback(() => setCam("erro"), []);
  const { video, canvas } = useQrCamera(cam === "on" && !off, check, busy, camError);

  // outras portarias também marcam entradas: atualiza o contador de tempos em tempos
  useEffect(() => {
    if (off) return;
    const iv = setInterval(() => {
      void linkCounts(token).then((r) => { if (r.ok) setCounts({ inside: r.inside, total: r.total }); else setOff(true); }).catch(() => {});
    }, 20_000);
    return () => clearInterval(iv);
  }, [token, off]);

  if (off || !event) {
    return (
      <div className="pg-checkin">
        <header className="ci-top"><BrandLogo height={20} /></header>
        <div className="ci-off">
          <span className="ci-off-ic" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <h1>Link de check-in desligado</h1>
          <p>Este link não vale mais: o produtor desligou, ou o evento já terminou. Peça um link novo para quem organiza o evento.</p>
        </div>
      </div>
    );
  }

  const pct = counts.total ? Math.min(100, Math.round((counts.inside / counts.total) * 100)) : 0;
  const okCount = log.filter((x) => x.kind === "ok").length;
  return (
    <div className="pg-checkin">
      <header className="ci-top">
        <BrandLogo height={20} />
        {gate && <span className="ci-gate"><i aria-hidden="true" />{gate}</span>}
      </header>

      <main className="ci-main">
        <section className="ci-ev">
          <div className="ci-art"><FlyerArt id={event.flyerId} /></div>
          <div className="ci-ei"><b>{event.title}</b><span>{event.when}</span></div>
        </section>

        <section className="ci-count" aria-label="Entradas">
          <div className="ci-nums"><b>{n(counts.inside)}</b><span>de {n(counts.total)} entraram</span><em>{pct}%</em></div>
          <span className="ci-bar"><i style={{ width: `${pct}%` }} /></span>
        </section>

        <section className={`ci-cam${cam === "on" ? " live" : ""}`}>
          {cam === "on" ? (
            <>
              <video ref={video} playsInline muted />
              <canvas ref={canvas} hidden />
              <span className="ci-aim" aria-hidden="true"><i /><i /><i /><i /></span>
              <span className="ci-hint">Aponte para o QR code do ingresso</span>
            </>
          ) : (
            <div className="ci-cam-off">
              <span className="ci-qr" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 12h8" /></svg>
              </span>
              <b>{cam === "erro" ? "Não deu para abrir a câmera" : "Ler ingressos"}</b>
              <span>{cam === "erro" ? "Permita o acesso à câmera nas configurações do navegador, ou digite o código abaixo." : "A entrada é marcada na hora. Cada QR code vale uma vez só."}</span>
              <button className="ci-btn" type="button" onClick={() => setCam("on")}>{cam === "erro" ? "Tentar de novo" : "Abrir câmera"}</button>
            </div>
          )}
        </section>

        <form className="ci-code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { void check(code.trim()); setCode(""); } }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Digitar código do ingresso" autoCapitalize="characters" autoComplete="off" aria-label="Código do ingresso" />
          <button type="submit" disabled={!code.trim()}>Validar</button>
        </form>

        <section className="ci-log">
          <div className="ci-log-h"><b>Leituras deste celular</b><span>{okCount} {okCount === 1 ? "entrada" : "entradas"}</span></div>
          {log.length ? log.map((s) => (
            <div className="ci-row" key={s.id}>
              <span className={`ci-dot ${s.kind}`} aria-hidden="true" />
              <div className="ci-ri"><b>{s.title}</b>{s.sub && <span>{s.sub}</span>}</div>
              <time>{s.at}</time>
            </div>
          )) : <p className="ci-empty">Nenhuma leitura ainda.</p>}
        </section>
      </main>

      {result && (
        <div className={`ci-res ${result.kind}`} role="status" aria-live="assertive">
          <span className="ci-res-ic" aria-hidden="true">
            {result.kind === "ok"
              ? <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              : result.kind === "used"
                ? <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                : <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>}
          </span>
          <b className="ci-res-t">{result.kind === "ok" ? "Pode entrar" : result.kind === "used" ? "Já entrou" : "Não liberado"}</b>
          <span className="ci-res-n">{result.title}</span>
          {result.sub && <span className="ci-res-s">{result.sub}</span>}
        </div>
      )}
    </div>
  );
}
