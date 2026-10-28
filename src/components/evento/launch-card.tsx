"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { signupLaunch } from "@/lib/actions/launch";
import { brl } from "@/lib/format";
import type { EventoData } from "./types";

/* Relógio de 1 s compartilhado; no servidor (e na hidratação) vale 0, e a contagem aparece em seguida. */
const subscribe = (cb: () => void) => { const iv = setInterval(cb, 1000); return () => clearInterval(iv); };
const nowSec = () => Math.floor(Date.now() / 1000);
const serverSec = () => 0;
export function useNowSec() { return useSyncExternalStore(subscribe, nowSec, serverSec); }

/** Quando a contagem termina: a pré-venda (se ainda não começou) ou a venda geral. */
export const launchTarget = (L: EventoData["launch"]) => (L.phase === "soon" && L.presaleAt ? L.presaleAt : L.openAt);
const split = (left: number) => ({ d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 });
const p2 = (v: number) => String(v).padStart(2, "0");

/** Relógio de dígitos que viram (dias : horas : min : seg). Cada dígito anima quando muda. */
export function FlipClock({ left, ready, label }: { left: number; ready: boolean; label: string }) {
  const { d, h, m, s } = split(left);
  const units: [string, string, string][] = [[p2(d), d === 1 ? "dia" : "dias", "d"], [p2(h), "horas", "h"], [p2(m), "min", "m"], [p2(s), "seg", "s"]];
  return (
    <div className="fc" role="timer" aria-label={`${label} ${d} dias, ${h} horas e ${m} minutos`}>
      {units.map(([v, l, k], i) => (
        <Fragment key={k}>
          {i > 0 && <i className="fc-sep" aria-hidden="true">:</i>}
          <div className={`fc-u fc-u-${k}`}>
            <div className="fc-ds" aria-hidden="true">
              {[...v].map((ch, j) => <span className="fc-d" key={j}><b key={ready ? ch : "-"}>{ready ? ch : "–"}</b></span>)}
            </div>
            <span className="fc-l">{l}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Contagem curta para as barras ("2d 14:22:05"). */
export function MiniCountdown({ target }: { target: string }) {
  const now = useNowSec();
  const left = Math.max(0, Math.floor(new Date(target).getTime() / 1000) - now);
  const { d, h, m, s } = split(left);
  return <b className="mini-cd" role="timer">{now ? `${d ? `${d}d ` : ""}${p2(h)}:${p2(m)}:${p2(s)}` : "--:--:--"}</b>;
}

const DT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => DT.format(new Date(iso)).replace(/\./g, "").replace(",", "").replace(/^(\w)/, (c) => c.toUpperCase());

/** Contagem regressiva + "me avise" / cadastro da pré-venda, no lugar dos ingressos antes da abertura. */
export function LaunchCard({ e, email: initialEmail }: { e: EventoData; email: string }) {
  const L = e.launch;
  const router = useRouter();
  const now = useNowSec();
  const presaleSignup = L.phase === "soon" && !!L.presaleAt;
  const target = launchTarget(L)!;
  const left = Math.max(0, Math.floor(new Date(target).getTime() / 1000) - now);
  const [email, setEmail] = useState(initialEmail);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  // chegou a hora: recarrega a página (abre a pré-venda ou os ingressos)
  const refreshed = useRef(false);
  useEffect(() => {
    if (now && left === 0 && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [now, left, router]);


  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    start(async () => {
      const r = await signupLaunch(e.slug, presaleSignup ? "presale" : "abertura", email);
      if (r.ok) { setDone(true); setMsg({ ok: true, text: r.message ?? "" }); } else setMsg({ ok: false, text: r.error });
    });
  };

  const title = L.phase === "presale" ? "A venda geral abre em" : presaleSignup ? "A pré-venda começa em" : "As vendas abrem em";
  const kick = L.phase === "presale" ? "Pré-venda em andamento" : presaleSignup ? "Pré-venda para cadastrados" : "Em breve";

  return (
    <div className="buy lnch" id="ingressos">
      <span className="ln-k"><i className="ln-pulse" aria-hidden="true" />{kick}</span>
      <h2 className="ln-t">{title}</h2>
      <FlipClock left={left} ready={!!now} label={title} />
      <span className="ln-when">{when(target)}</span>

      {L.presaleAt && (
        <ol className="ln-steps">
          <li className={L.phase === "soon" ? "cur" : "ok"}><i aria-hidden="true" /><div><b>Pré-venda</b><span>Só para cadastrados · {when(L.presaleAt)}</span></div></li>
          <li className={L.phase === "presale" ? "cur" : ""}><i aria-hidden="true" /><div><b>Venda geral</b><span>Para todos · {when(L.openAt!)}</span></div></li>
        </ol>
      )}
      {L.phase === "presale" && <p className="ln-note">A pré-venda começou para quem se cadastrou e recebeu o link por e-mail. Deixe seu e-mail para saber quando a venda geral abrir.</p>}

      {done ? (
        <div className="ln-ok" role="status">
          <span className="ln-okic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <div>
            <b>{presaleSignup ? "Você está na pré-venda" : "Pronto, vamos te avisar"}</b>
            <span>{msg?.text || (presaleSignup ? `Quando ela começar, o link exclusivo chega em ${email.trim()}.` : `Assim que as vendas abrirem, avisamos em ${email.trim()}.`)}</span>
          </div>
        </div>
      ) : (
        <form className="ln-f" onSubmit={submit}>
          <label className="sr" htmlFor="ln-mail">Seu e-mail</label>
          <input id="ln-mail" type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(x) => { setEmail(x.target.value); setMsg(null); }} required />
          <button className="go" type="submit" disabled={pending || !email.trim()}>
            {pending ? "Enviando…" : presaleSignup ? "Quero entrar na pré-venda" : "Me avise na abertura"}
          </button>
          {msg && !msg.ok && <p className="cupmsg err" role="alert">{msg.text}</p>}
          <p className="ln-fine">{presaleSignup ? "Só quem se cadastrar recebe o link secreto para comprar antes de todo mundo." : "Um e-mail só, na hora em que abrir. Sem spam."}</p>
        </form>
      )}

      {e.minPriceCents > 0 && <p className="ln-from">Ingressos a partir de <b>{brl(e.minPriceCents)}</b></p>}
    </div>
  );
}
