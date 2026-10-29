"use client";

import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Service worker da portaria: deixa o app instalável no Android e abre a tela "sem internet" offline. */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/portaria/sw.js", { scope: "/portaria/" }).catch(() => {});
  }, []);
  return null;
}

const KEY = "tw:portaria:install-ok";

/** Aviso para instalar na tela de início: botão no Android, passo a passo no iPhone. Some quando já está instalado. */
export function InstallHint({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"none" | "ios" | "android">("none");
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let hidden = false;
    try { hidden = localStorage.getItem(KEY) === "1"; } catch { /* sem armazenamento */ }
    if (standalone || hidden) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setMode("android"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = ios ? window.setTimeout(() => setMode("ios"), 0) : 0;
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.clearTimeout(t); };
  }, []);
  const close = () => { setMode("none"); try { localStorage.setItem(KEY, "1"); } catch { /* ok */ } };
  if (mode === "none") return null;
  return (
    <div className={compact ? "pt-inst sm" : "pt-inst"} role="note">
      <span className="pt-inst-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg></span>
      {mode === "ios" ? (
        <span className="pt-inst-t"><b>Instale no iPhone</b>Toque em <i aria-label="Compartilhar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9" /></svg></i> e depois em <b className="in">Adicionar à Tela de Início</b>.</span>
      ) : (
        <span className="pt-inst-t"><b>Instale o app da portaria</b>Abre direto na câmera, em tela cheia.</span>
      )}
      {mode === "android" && evt && <button className="pt-inst-go" type="button" onClick={() => { void evt.prompt(); void evt.userChoice.finally(close); }}>Instalar</button>}
      <button className="pt-inst-x" type="button" onClick={close} aria-label="Fechar aviso">×</button>
    </div>
  );
}
