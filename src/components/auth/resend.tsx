"use client";

import { useEffect, useState } from "react";

/** Segundos até poder pedir outro código (igual ao limite do servidor). */
export const RESEND_WAIT = 30;

/**
 * "Reenviar em 30s" → "Reenviar código". `wait`: segundos que ainda faltam quando o botão aparece.
 * `onResend` devolve `true` se mandou (a contagem recomeça). `wait` só vale ao montar.
 */
export function ResendButton({ onResend, wait = RESEND_WAIT, label = "Reenviar código", className = "au-lk", disabled }: { onResend: () => Promise<boolean>; wait?: number; label?: string; className?: string; disabled?: boolean }) {
  const [left, setLeft] = useState(wait);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  async function go() {
    if (left > 0 || busy) return;
    setBusy(true);
    const ok = await onResend().catch(() => false);
    setBusy(false);
    if (ok) setLeft(RESEND_WAIT);
  }
  return (
    <button type="button" className={className} onClick={() => void go()} disabled={disabled || busy || left > 0} aria-live="polite">
      {busy ? "Enviando…" : left > 0 ? `Não recebeu? Reenviar em ${left}s` : label}
    </button>
  );
}
