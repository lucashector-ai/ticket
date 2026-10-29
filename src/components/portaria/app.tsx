"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQrCamera } from "@/components/checkin/use-qr-camera";
import { leavePortaria, portariaCounts, portariaGuests, portariaRelease, portariaScan, type Guest, type PortariaScan } from "@/lib/actions/portaria";
import { InstallHint } from "./install";

type Counts = { inside: number; total: number };
type Result = PortariaScan & { at: number };

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Sem som: só uma vibração curta (Android), uma para liberado e duas para recusado. */
const buzz = (ok: boolean) => { try { navigator.vibrate?.(ok ? 40 : [60, 50, 60]); } catch { /* sem vibração */ } };

/** App da portaria: câmera em tela cheia; ao ler um QR a tela brilha (verde liberado / vermelho recusado) e mostra quem é. */
export function PortariaApp({ gate, event, counts: c0 }: { gate: string; event: { title: string; when: string }; counts: Counts }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>(c0);
  const [res, setRes] = useState<Result | null>(null);
  const [panel, setPanel] = useState<"none" | "list" | "type" | "menu">("none");
  const [camErr, setCamErr] = useState(false);
  const [camKey, setCamKey] = useState(0);
  const [off, setOff] = useState(false);
  const busy = useRef(false);
  const timer = useRef(0);

  const show = useCallback((r: PortariaScan) => {
    if (r.off) { setOff(true); return; }
    if (typeof r.inside === "number" && typeof r.total === "number") setCounts({ inside: r.inside, total: r.total });
    busy.current = true;
    setRes({ ...r, at: Date.now() });
    buzz(r.ok);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setRes(null); busy.current = false; }, r.ok ? 1700 : 3000);
  }, []);
  const dismiss = () => { window.clearTimeout(timer.current); setRes(null); busy.current = false; };

  const onRead = useCallback(async (text: string) => {
    busy.current = true;
    show(await portariaScan(text).catch(() => ({ ok: false, error: "Sem conexão. Confira a internet e leia de novo." })));
  }, [show]);
  const onCamErr = useCallback(() => setCamErr(true), []);
  const { video, canvas } = useQrCamera(panel === "none" && !off, onRead, busy, onCamErr, camKey);

  // outras portarias também liberam: a contagem se atualiza sozinha
  useEffect(() => {
    const t = window.setInterval(() => { void portariaCounts().then((r) => { if (r.ok) setCounts({ inside: r.inside, total: r.total }); else setOff(true); }).catch(() => {}); }, 20000);
    return () => window.clearInterval(t);
  }, []);

  const leave = async () => { await leavePortaria(); router.refresh(); };
  const pct = counts.total ? Math.min(100, Math.round((counts.inside / counts.total) * 100)) : 0;

  if (off) {
    return (
      <main className="pt-off">
        <b>Acesso desligado</b>
        <span>O produtor desligou este acesso de check-in ou o evento já acabou.</span>
        <button className="pt-go" type="button" onClick={() => void leave()}>Entrar com outro código</button>
      </main>
    );
  }

  return (
    <main className="pt-app">
      <video ref={video} className="pt-video" playsInline muted aria-hidden="true" />
      <canvas ref={canvas} hidden />
      <div className="pt-shade" aria-hidden="true" />

      <header className="pt-top">
        <div className="pt-ev"><span className="pt-gate"><i />{gate}</span><b>{event.title}</b><small>{event.when}</small></div>
        <button className="pt-ib" type="button" onClick={() => setPanel("menu")} aria-label="Opções">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      </header>
      <div className="pt-count" aria-live="polite">
        <b>{counts.inside.toLocaleString("pt-BR")}</b><span>de {counts.total.toLocaleString("pt-BR")} entraram</span>
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="pt-aim" aria-hidden="true"><b className="pt-core" /><span /><span /><span /><span /><i className="pt-scan" /></div>
      <p className="pt-hint">{camErr ? "Não conseguimos abrir a câmera." : "Aponte para o QR code do ingresso"}</p>
      {camErr && <button className="pt-retry" type="button" onClick={() => { setCamErr(false); setCamKey((k) => k + 1); }}>Permitir câmera</button>}

      <nav className="pt-bar">
        <button type="button" onClick={() => setPanel("list")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
          Lista
        </button>
        <button type="button" onClick={() => setPanel("type")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10" /></svg>
          Digitar código
        </button>
      </nav>
      <div className="pt-inst-wrap"><InstallHint compact /></div>

      {res && <ResultView r={res} onClose={dismiss} />}
      {panel === "list" && <GuestList onClose={() => setPanel("none")} onRelease={async (id) => { const r = await portariaRelease(id).catch(() => ({ ok: false, error: "Sem conexão." })); show(r); return r; }} />}
      {panel === "type" && <TypeCode onClose={() => setPanel("none")} onSend={async (code) => { setPanel("none"); show(await portariaScan(code).catch(() => ({ ok: false, error: "Sem conexão." }))); }} />}
      {panel === "menu" && (
        <div className="pt-sheet sm" role="dialog" aria-label="Opções" onClick={() => setPanel("none")}>
          <div className="pt-sh-in" onClick={(e) => e.stopPropagation()}>
            <b className="pt-sh-t">{event.title}</b>
            <span className="pt-sh-s">Acesso: {gate}</span>
            <button className="pt-row-b" type="button" onClick={() => { setPanel("none"); setCamKey((k) => k + 1); }}>Reiniciar câmera</button>
            <button className="pt-row-b danger" type="button" onClick={() => void leave()}>Sair deste evento</button>
            <button className="pt-row-b ghost" type="button" onClick={() => setPanel("none")}>Fechar</button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Resultado no estilo da Siri: uma onda de luz entra pelas bordas, fica um contorno luminoso
 *  girando em volta da tela e, no meio, um cartão de vidro com o nome. Verde claro = liberado. */
function ResultView({ r, onClose }: { r: Result; onClose: () => void }) {
  const used = !r.ok && !!r.checkedInAt;
  const name = r.ticket?.holderName?.trim() || (r.ticket ? "Sem nome no ingresso" : "");
  return (
    <button className={r.ok ? "pt-res ok" : "pt-res bad"} type="button" onClick={onClose} key={r.at} aria-live="assertive">
      <span className="pt-edge" aria-hidden="true"><i /></span>
      <span className="pt-glass">
        <span className="pt-mark" aria-hidden="true">
          <i className="wave" />
          <svg viewBox="0 0 52 52">
            {r.ok ? <path className="draw" d="M14 27l8 8L38 18" /> : <><path className="draw" d="M17 17l18 18" /><path className="draw" d="M35 17L17 35" /></>}
          </svg>
        </span>
        <span className="pt-res-k">{r.ok ? "Entrada liberada" : used ? `Já entrou às ${hhmm(r.checkedInAt)}` : "Não liberado"}</span>
        {name && <b className="pt-res-n">{name}</b>}
        {r.ticket && <span className="pt-res-t">{[r.ticket.sector, r.ticket.ticketType].filter(Boolean).join(" · ")}</span>}
        {!r.ok && !used && <span className="pt-res-e">{r.error}</span>}
        {r.ticket && <code className="pt-res-c">{r.ticket.code}</code>}
      </span>
      <span className="pt-res-tap">Toque para continuar</span>
    </button>
  );
}

function GuestList({ onClose, onRelease }: { onClose: () => void; onRelease: (id: string) => Promise<PortariaScan> }) {
  const [list, setList] = useState<Guest[] | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "out" | "in">("all");
  const [arm, setArm] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void portariaGuests().then((r) => { if (alive) setList(r.ok ? r.guests : []); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);
  const shown = useMemo(() => {
    const s = norm(q.trim());
    return (list ?? []).filter((g) => (f === "all" || (f === "in" ? !!g.inAt : !g.inAt)) && (!s || norm(g.name).includes(s) || g.code.toLowerCase().includes(s)));
  }, [list, q, f]);
  const inside = (list ?? []).filter((g) => g.inAt).length;
  const release = async (g: Guest) => {
    if (arm !== g.id) { setArm(g.id); window.setTimeout(() => setArm((a) => (a === g.id ? null : a)), 3500); return; }
    setArm(null);
    const r = await onRelease(g.id);
    if (r.ok || r.checkedInAt) setList((l) => l?.map((x) => (x.id === g.id ? { ...x, inAt: r.checkedInAt ?? new Date().toISOString() } : x)) ?? l);
  };
  return (
    <div className="pt-sheet" role="dialog" aria-label="Lista de participantes">
      <div className="pt-sh-in full">
        <div className="pt-lh">
          <b>Participantes</b>
          <button className="pt-ib light" type="button" onClick={onClose} aria-label="Fechar lista">×</button>
        </div>
        <input className="pt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou código" aria-label="Buscar participante" autoComplete="off" />
        <div className="pt-seg">
          {([["all", `Todos ${list?.length ?? ""}`], ["out", `Faltam ${list ? list.length - inside : ""}`], ["in", `Entraram ${list ? inside : ""}`]] as const).map(([k, l]) => (
            <button key={k} type="button" className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
        <ul className="pt-list">
          {list === null && <li className="pt-empty">Carregando…</li>}
          {list !== null && !shown.length && <li className="pt-empty">{q ? "Ninguém com esse nome." : "Nenhum ingresso aqui."}</li>}
          {shown.slice(0, 400).map((g) => (
            <li key={g.id} className={g.inAt ? "in" : ""}>
              <span className="pt-av" aria-hidden="true">{g.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}</span>
              <span className="pt-gi"><b>{g.name}</b><small>{[g.sector, g.type].filter(Boolean).join(" · ")} · {g.code.slice(-4)}</small></span>
              {g.inAt ? <span className="pt-in">Entrou {hhmm(g.inAt)}</span>
                : <button className={arm === g.id ? "pt-rel arm" : "pt-rel"} type="button" onClick={() => void release(g)}>{arm === g.id ? "Confirmar" : "Liberar"}</button>}
            </li>
          ))}
          {shown.length > 400 && <li className="pt-empty">Mostrando 400 de {shown.length}. Busque pelo nome.</li>}
        </ul>
      </div>
    </div>
  );
}

function TypeCode({ onClose, onSend }: { onClose: () => void; onSend: (code: string) => void }) {
  const [v, setV] = useState("TW-");
  const fmt = (s: string) => {
    const x = s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^TW/, "").slice(0, 8);
    return `TW-${x.slice(0, 4)}${x.length > 4 ? `-${x.slice(4)}` : ""}`;
  };
  const ok = /^TW-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(v);
  return (
    <div className="pt-sheet sm" role="dialog" aria-label="Digitar código do ingresso" onClick={onClose}>
      <form className="pt-sh-in" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (ok) onSend(v); }}>
        <b className="pt-sh-t">Digitar código</b>
        <span className="pt-sh-s">Está embaixo do QR code no ingresso.</span>
        <input className="pt-code" value={v} onChange={(e) => setV(fmt(e.target.value))} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} autoFocus aria-label="Código do ingresso" />
        <button className="pt-go" type="submit" disabled={!ok}>Validar</button>
        <button className="pt-row-b ghost" type="button" onClick={onClose}>Cancelar</button>
      </form>
    </div>
  );
}
