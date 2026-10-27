"use client";

import Link from "next/link";
import type { LineupItem } from "./types";
import { ListenButton, type Player } from "./player";

function Avatar({ a, big }: { a: LineupItem; big?: boolean }) {
  return (
    <span className={big ? "lu-ph big" : "lu-ph"} style={{ background: a.grad, color: a.fg }} title={a.initials}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a.image && <img className="lu-img" src={a.image} alt="" loading="lazy" />}
      {!a.image && <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="15.5" r="7" fill="currentColor" />
        <path d="M6 40c1.6-8.6 7.2-13.4 14-13.4S32.4 31.4 34 40z" fill="currentColor" />
      </svg>}
    </span>
  );
}

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11L11 5M6 5h5v5" /></svg>
);

export function Lineup({ lineup, timed, p }: { lineup: LineupItem[]; timed: boolean; p: Player }) {
  if (!lineup.length) return null;
  const n = lineup.length;
  return (
    <div className="blk-s">
      <div className="lu-h">
        <h2>Line-up</h2>
        <span className="lu-note">{n} {n === 1 ? "atração" : "atrações"}</span>
      </div>
      {timed ? (
        <ol className="lu">
          {lineup.map((a) => (
            <li className="lu-r" key={a.id}>
              <span className="lu-time">{a.time ?? "—"}</span>
              <Avatar a={a} />
              <span className="lu-n">
                <b>{a.name}</b>
                <small>{a.role ?? "Set ao vivo"}</small>
              </span>
              <ListenButton artist={a} p={p} />
              <Link className="lu-go" href={`/artistas/${a.slug}`} aria-label={`Ver perfil de ${a.name}`}>
                <span className="lu-go-l">Ver artista</span>
                <span className="lu-go-a"><ArrowIcon /></span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="lu-grid">
          {lineup.map((a) => (
            <div className="lu-card" key={a.id}>
              <Link className="lu-card-a" href={`/artistas/${a.slug}`} aria-label={`Ver perfil de ${a.name}`}>
                <Avatar a={a} big />
                <b>{a.name}</b>
                <small>Ver perfil <ArrowIcon /></small>
              </Link>
              <ListenButton artist={a} p={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
