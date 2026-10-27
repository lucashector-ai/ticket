"use client";

import jsQR from "jsqr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { scanTicket } from "@/lib/actions/painel";

type Shot = { id: number; ok: boolean; title: string; sub: string; at: string };
const hm = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Leitor de QR da portaria: câmera traseira + jsQR (funciona no iPhone e no Android) ou código digitado. */
export function Portaria({ eventId, title, sub, total, inside: inside0 }: { eventId: string; title: string; sub: string; total: number; inside: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const lastRead = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [cam, setCam] = useState<"off" | "on" | "erro">("off");
  const [inside, setInside] = useState(inside0);
  const [result, setResult] = useState<Shot | null>(null);
  const [log, setLog] = useState<Shot[]>([]);
  const [code, setCode] = useState("");
  const seq = useRef(0);

  const check = useCallback(async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const r = await scanTicket(eventId, text).catch(() => ({ ok: false, error: "Sem conexão. Tente de novo.", ticket: undefined, auth: true }));
    const t = r.ticket;
    const shot: Shot = {
      id: ++seq.current, ok: r.ok,
      title: r.ok ? (t?.holderName || "Entrada liberada") : (r.error ?? "Não foi possível validar"),
      sub: t ? [t.sector, t.ticketType, t.code].filter(Boolean).join(" · ") : "",
      at: hm(),
    };
    if (r.ok) setInside((n) => n + 1);
    try { navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]); } catch { /* sem vibração */ }
    setResult(shot);
    setLog((l) => [shot, ...l].slice(0, 30));
    setTimeout(() => { setResult(null); busy.current = false; }, r.ok ? 1400 : 2600);
  }, [eventId]);

  /* câmera: lê um quadro a cada ~200ms e procura um QR */
  useEffect(() => {
    if (cam !== "on") return;
    let stream: MediaStream | null = null, timer = 0, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (stop) return;
          const c = canvas.current, vv = video.current;
          if (c && vv && vv.videoWidth && !busy.current) {
            const w = 480, h = Math.round((vv.videoHeight / vv.videoWidth) * w);
            c.width = w; c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(vv, 0, 0, w, h);
            const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (qr?.data && !(qr.data === lastRead.current.text && now - lastRead.current.at < 4000)) {
              lastRead.current = { text: qr.data, at: now };
              void check(qr.data);
            }
          }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch {
        setCam("erro");
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, check]);

  const pct = total ? Math.round((inside / total) * 100) : 0;
  return (
    <div className="pane prt">
      <nav className="crumb3" aria-label="Você está em"><Link className="cr-b" href="/painel/equipe">Portaria</Link><span aria-hidden="true">›</span><span className="cr-c">{title}</span></nav>
      <div className="prt-h">
        <div><h1 className="pg-t" style={{ fontSize: 26 }}>{title}</h1><p className="pg-s">{sub}</p></div>
        <div className="prt-n"><b>{inside.toLocaleString("pt-BR")}</b><span>de {total.toLocaleString("pt-BR")} entraram · {pct}%</span></div>
      </div>

      <div className="prt-g">
        <section className={`prt-cam${result ? (result.ok ? " ok" : " no") : ""}`}>
          {cam === "on" ? (
            <>
              <video ref={video} playsInline muted />
              <canvas ref={canvas} hidden />
              <span className="prt-aim" aria-hidden="true" />
            </>
          ) : (
            <div className="prt-off">
              <b>{cam === "erro" ? "Não deu para abrir a câmera" : "Leitor de QR code"}</b>
              <span>{cam === "erro" ? "Permita o acesso à câmera nas configurações do navegador, ou digite o código do ingresso abaixo." : "Aponte a câmera para o QR code do ingresso. A entrada é marcada na hora."}</span>
              <button className="b2 dark" type="button" onClick={() => setCam("on")}>{cam === "erro" ? "Tentar de novo" : "Abrir câmera"}</button>
            </div>
          )}
          {result && (
            <div className="prt-res" role="status" aria-live="assertive">
              <span className="prt-ic" aria-hidden="true">{result.ok ? "✓" : "✕"}</span>
              <b>{result.title}</b>
              {result.sub && <span>{result.sub}</span>}
            </div>
          )}
        </section>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Digitar código</h2></div>
            <form className="frm" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { void check(code.trim()); setCode(""); } }}>
              <label className="fld"><span>Código do ingresso</span><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TW-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" /></label>
              <button className="b2 dark block" type="submit" disabled={!code.trim()}>Validar</button>
            </form>
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Leituras deste aparelho</h2><span className="card-s">{log.filter((x) => x.ok).length} {log.filter((x) => x.ok).length === 1 ? "entrada" : "entradas"}</span></div>
            {log.length ? log.map((s) => (
              <div className="fd" key={s.id}><span className={s.ok ? "sdot" : "sdot no"} aria-hidden="true" /><div className="fd-i"><b className="fd-n">{s.title}</b><span className="fd-s">{s.sub}</span></div><span className="fd-s">{s.at}</span></div>
            )) : <span className="card-s">Nenhuma leitura ainda.</span>}
          </section>
        </aside>
      </div>
    </div>
  );
}
