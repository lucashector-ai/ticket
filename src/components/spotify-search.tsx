"use client";

import { useEffect, useRef, useState } from "react";

export type SpotifyHit = { id: string; name: string; image: string | null; genres: string[] };

export const SpotifyIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1ED760" />
    <path d="M6.6 9.4c3.4-1 7.6-.7 10.6 1M7.1 12.5c2.8-.8 6.2-.5 8.6.9M7.6 15.4c2.3-.6 4.8-.4 6.8.7" fill="none" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * Campo com busca de artistas no Spotify. `onPick` recebe o artista escolhido;
 * `onPlain` (opcional) usa só o texto digitado, para quem não está no Spotify.
 */
export function SpotifyArtistSearch({ value, onChange, onPick, onPlain, placeholder, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (a: SpotifyHit) => void;
  onPlain?: (name: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [hits, setHits] = useState<SpotifyHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const [act, setAct] = useState(0);
  const seq = useRef(0);
  const q = value.trim();

  useEffect(() => {
    if (off || q.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await fetch(`/api/spotify/buscar?q=${encodeURIComponent(q)}`).catch(() => null);
      if (n !== seq.current) return;
      setBusy(false);
      // sem Spotify configurado (ou sem login): vira um campo de texto comum
      if (r && (r.status === 503 || r.status === 401)) { setOff(true); return; }
      const j = (await r?.json().catch(() => null)) as { artists?: SpotifyHit[] } | null;
      setHits(j?.artists ?? []);
      setAct(0);
    }, 280);
    return () => clearTimeout(t);
  }, [q, off]);

  const shown = q.length >= 2 ? hits : [];
  const opts = shown.length + (onPlain && q ? 1 : 0);
  const choose = (i: number) => {
    if (i < shown.length) onPick(shown[i]);
    else if (onPlain && q) onPlain(q);
    setOpen(false); setHits([]);
  };

  return (
    <div className="spx">
      <input autoComplete="off" className="in" type="text" value={value} placeholder={placeholder} autoFocus={autoFocus}
        role="combobox" aria-expanded={open && opts > 0} aria-controls="spx-l" aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && opts) { e.preventDefault(); setOpen(true); setAct((a) => (a + 1) % opts); }
          else if (e.key === "ArrowUp" && opts) { e.preventDefault(); setAct((a) => (a - 1 + opts) % opts); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && opts) choose(act); else if (onPlain && q) onPlain(q); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {busy && <span className="spx-busy" aria-hidden="true" />}
      {open && opts > 0 && (
        <ul className="spx-l" id="spx-l" role="listbox">
          {shown.map((a, i) => (
            <li key={a.id} role="option" aria-selected={act === i} className={act === i ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); choose(i); }} onMouseEnter={() => setAct(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.image ? <img className="spx-av" src={a.image} alt="" /> : <span className="spx-av" />}
              <span className="spx-t"><b>{a.name}</b><span>{a.genres.slice(0, 2).join(" · ") || "Artista"}</span></span>
              <SpotifyIcon />
            </li>
          ))}
          {onPlain && q && (
            <li role="option" aria-selected={act === shown.length} className={act === shown.length ? "on plain" : "plain"} onMouseDown={(e) => { e.preventDefault(); choose(shown.length); }} onMouseEnter={() => setAct(shown.length)}>
              <span className="spx-av plus" aria-hidden="true">+</span>
              <span className="spx-t"><b>Adicionar “{q}”</b><span>sem ligar ao Spotify</span></span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
