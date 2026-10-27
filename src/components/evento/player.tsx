"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LineupItem } from "./types";

const TRACK_SECONDS = 30;

type PlayerState = { artist: LineupItem; ti: number; pos: number; paused: boolean } | null;

/** Player mock: prévia simulada de 30s por faixa, sem áudio real (como no design). */
export function usePlayer() {
  const [pl, setPl] = useState<PlayerState>(null);

  useEffect(() => {
    if (!pl || pl.paused) return;
    const id = setInterval(() => {
      setPl((s) => {
        if (!s || s.paused) return s;
        const p = s.pos + 0.25;
        if (p < TRACK_SECONDS) return { ...s, pos: p };
        const n = s.ti + 1;
        return n < s.artist.tracks.length ? { ...s, ti: n, pos: 0 } : null;
      });
    }, 250);
    return () => clearInterval(id);
  }, [pl]);

  const play = useCallback((artist: LineupItem) => {
    setPl((s) => {
      if (s && s.artist.id === artist.id) return { ...s, paused: !s.paused };
      if (!artist.tracks.length) return s;
      return { artist, ti: 0, pos: 0, paused: false };
    });
  }, []);
  const toggle = useCallback(() => setPl((s) => (s ? { ...s, paused: !s.paused } : s)), []);
  const close = useCallback(() => setPl(null), []);

  const isCurrent = (id: string) => !!pl && pl.artist.id === id;
  const isPlaying = (id: string) => !!pl && pl.artist.id === id && !pl.paused;

  return { pl, play, toggle, close, isCurrent, isPlaying };
}

export type Player = ReturnType<typeof usePlayer>;

export function PlayerBar({ p }: { p: Player }) {
  const pl = p.pl;
  if (!pl) return null;
  const track = pl.artist.tracks[pl.ti];
  const sec = Math.floor(pl.pos);
  const pct = Math.round((pl.pos / TRACK_SECONDS) * 1000) / 10;
  return (
    <div className="pl" role="region" aria-label="Prévia tocando">
      <span className="pl-c" style={{ background: track.grad, color: pl.artist.fg }}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="15.5" r="7" fill="currentColor" />
          <path d="M6 40c1.6-8.6 7.2-13.4 14-13.4S32.4 31.4 34 40z" fill="currentColor" />
        </svg>
      </span>
      <div className="pl-t">
        <b>{track.title}</b>
        <span className="pl-s">
          <span className={pl.paused ? "eq pz" : "eq"} aria-hidden="true"><i /><i /><i /><i /></span>
          {pl.artist.name} · Prévia 0:{sec < 10 ? "0" : ""}{sec} / 0:30
        </span>
      </div>
      <Link className="pl-a" href={`/artistas/${pl.artist.slug}`}>Ver artista</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button className="pl-b" type="button" onClick={p.toggle} aria-label={pl.paused ? "Continuar" : "Pausar"}>
          {pl.paused ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13.4 8z" fill="currentColor" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /></svg>
          )}
        </button>
        <button className="pl-x" type="button" onClick={p.close} aria-label="Fechar prévia">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <span className="pl-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

/** Botão "Ouvir"/"Tocando" usado no line-up. */
export function ListenButton({ artist, p }: { artist: LineupItem; p: Player }) {
  const playing = p.isPlaying(artist.id);
  // sem faixas próprias: se o artista está ligado ao Spotify, leva ao player na página dele
  if (!artist.tracks.length) {
    if (!artist.spotify) return null;
    return (
      <a className="ou" href={`/artistas/${artist.slug}#ouvir`} aria-label={`Ouvir ${artist.name} no Spotify`}>
        <span className="ou-i"><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13.4 8z" fill="currentColor" /></svg></span>
        Ouvir
      </a>
    );
  }
  return (
    <button className={p.isCurrent(artist.id) ? "ou on" : "ou"} type="button" onClick={() => p.play(artist)} aria-label={`Ouvir ${artist.name}`} aria-pressed={playing}>
      <span className="ou-i">
        {playing ? (
          <span className="eq" aria-hidden="true"><i /><i /><i /><i /></span>
        ) : (
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13.4 8z" fill="currentColor" /></svg>
        )}
      </span>
      {playing ? "Tocando" : "Ouvir"}
    </button>
  );
}
