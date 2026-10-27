"use client";

import { useState } from "react";

/** Botão que copia um texto e mostra a confirmação por 2 segundos. */
export function CopyButton({ text, label, done, className }: { text: string; label: string; done: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sem permissão: o texto continua visível */ }
  };
  return <button className={className} type="button" onClick={() => void copy()}>{ok ? done : label}</button>;
}
