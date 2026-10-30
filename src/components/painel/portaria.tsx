"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useQrCamera } from "@/components/checkin/use-qr-camera";
import { scanTicket } from "@/lib/actions/painel";
import { ListaPortaria } from "./lista-portaria";

type Shot = { id: number; ok: boolean; title: string; sub: string; at: string };
const hm = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Leitor de QR da portaria: câmera do celular ou código digitado. */
export function Portaria({ eventId, title, sub, total, inside: inside0 }: { eventId: string; title: string; sub: string; total: number; inside: number }) {
  const busy = useRef(false);
  const [cam, setCam] = useState<"off" | "on" | "erro">("off");
  const [inside, setInside] = useState(inside0);
  const [result, setResult] = useState<Shot | null>(null);
  const [log, setLog] = useState<Shot[]>([]);
  const [code, setCode] = useState("");
  const seq = useRef(0);
  const camBox = useRef<HTMLElement>(null);
  const codeIn = useRef<HTMLInputElement>(null);
  /** no celular a câmera fica abaixo do título e o "Digitar código" abaixo dela: traz o resultado para a vista */
  const showBox = (block: ScrollLogicalPosition) => requestAnimationFrame(() => camBox.current?.scrollIntoView({ behavior: "smooth", block }));

  const check = useCallback(async (text: string, typed = false) => {
    if (busy.current) return;
    busy.current = true;
    const r = await scanTicket(eventId, text).catch(() => ({ ok: false, error: "Sem conexão. Tente de novo.", checkedInAt: null, ticket: undefined, auth: true }));
    const t = r.ticket;
    const shot: Shot = {
      id: ++seq.current, ok: r.ok,
      // já usado: o horário da entrada e o nome, como no app da portaria
      title: r.ok ? (t?.holderName || "Entrada liberada") : r.checkedInAt ? `Já entrou às ${new Date(r.checkedInAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}` : (r.error ?? "Não foi possível validar"),
      sub: t ? [!r.ok && r.checkedInAt ? t.holderName : null, t.sector, t.ticketType, t.code].filter(Boolean).join(" · ") : "",
      at: hm(),
    };
    if (r.ok) setInside((n) => n + 1);
    try { navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]); } catch { /* sem vibração */ }
    setResult(shot);
    setLog((l) => [shot, ...l].slice(0, 30));
    showBox("nearest");
    // código digitado: depois do resultado, o foco volta ao campo para o próximo
    setTimeout(() => { setResult(null); busy.current = false; if (typed) codeIn.current?.focus(); }, r.ok ? 1400 : 2600);
  }, [eventId]);

  const camError = useCallback(() => setCam("erro"), []);
  const { video, canvas } = useQrCamera(cam === "on", check, busy, camError);

  const pct = total ? Math.round((inside / total) * 100) : 0;
  return (
    <div className="pane prt">
      <nav className="crumb3" aria-label="Você está em"><Link className="cr-b" href="/painel/equipe">Portaria</Link><span aria-hidden="true">›</span><span className="cr-c">{title}</span></nav>
      <div className="prt-h">
        <div><h1 className="pg-t" style={{ fontSize: 26 }}>{title}</h1><p className="pg-s">{sub}</p></div>
        <div className="prt-n"><b>{inside.toLocaleString("pt-BR")}</b><span>de {total.toLocaleString("pt-BR")} entraram · {pct}%</span></div>
      </div>

      <div className="prt-g">
        <section ref={camBox} className={`prt-cam${result ? (result.ok ? " ok" : " no") : ""}`}>
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
              <button className="b2 dark" type="button" onClick={() => { setCam("on"); showBox("center"); }}>{cam === "erro" ? "Tentar de novo" : "Abrir câmera"}</button>
            </div>
          )}
          {result && (
            <div className="prt-res" role="status" aria-live="assertive">
              <span className="prt-ic" aria-hidden="true">{result.ok ? "✓" : "✕"}</span>
              <b className={result.title.length > 34 ? "long" : undefined}>{result.title}</b>
              {result.sub && <span>{result.sub}</span>}
              {!result.ok && /^(QR code inválido|Ingresso não encontrado)/.test(result.title) && <small>Peça o ingresso aberto em Meus ingressos ou no e-mail e confira o código.</small>}
            </div>
          )}
        </section>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Digitar código</h2></div>
            <form className="frm" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { void check(code.trim(), true); setCode(""); } }}>
              <label className="fld"><span>Código do ingresso</span><input ref={codeIn} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TW-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" /></label>
              <button className="b2 dark block" type="submit" disabled={!code.trim()}>Validar</button>
            </form>
          </section>
          <ListaPortaria eventId={eventId} />
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
