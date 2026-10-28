"use client";

import { Fragment, useSyncExternalStore } from "react";
import type { EventoData } from "./types";

/* Relógio de 1 s compartilhado; no servidor (e na hidratação) vale 0, e a contagem aparece em seguida. */
const subscribe = (cb: () => void) => { const iv = setInterval(cb, 1000); return () => clearInterval(iv); };
const nowSec = () => Math.floor(Date.now() / 1000);
const serverSec = () => 0;
export function useNowSec() { return useSyncExternalStore(subscribe, nowSec, serverSec); }

/** Quando a contagem termina: a pré-venda (se ainda não começou) ou a venda geral. */
export const launchTarget = (L: Pick<EventoData["launch"], "phase" | "presaleAt" | "openAt">) => (L.phase === "soon" && L.presaleAt ? L.presaleAt : L.openAt);
const split = (left: number) => ({ d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 });
const p2 = (v: number) => String(v).padStart(2, "0");

/** Relógio de dígitos que viram (dias : horas : min : seg). Cada dígito anima quando muda. */
export function FlipClock({ left, ready, label }: { left: number; ready: boolean; label: string }) {
  const { d, h, m, s } = split(left);
  const units: [string, string, string][] = [[p2(d), d === 1 ? "dia" : "dias", "d"], [p2(h), "horas", "h"], [p2(m), "min", "m"], [p2(s), "seg", "s"]];
  return (
    <div className="flc" role="timer" aria-label={`${label} ${d} dias, ${h} horas e ${m} minutos`}>
      {units.map(([v, l, k], i) => (
        <Fragment key={k}>
          {i > 0 && <i className="flc-sep" aria-hidden="true">:</i>}
          <div className={`flc-u flc-u-${k}`}>
            <div className="flc-ds" aria-hidden="true">
              {[...v].map((ch, j) => <span className="flc-d" key={j}><b key={ready ? ch : "-"}>{ready ? ch : "–"}</b></span>)}
            </div>
            <span className="flc-l">{l}</span>
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

