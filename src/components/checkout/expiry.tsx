"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Contagem regressiva da reserva (15 min). Ao zerar, recarrega a página para mostrar o estado expirado. */
export function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0) router.refresh();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  if (left == null) return <span className="ck-timer" aria-live="polite">Reserva válida por 15 minutos.</span>;
  const s = Math.floor(left / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className={left < 120_000 ? "ck-timer warn" : "ck-timer"} aria-live="polite">
      {left > 0 ? <>Sua reserva expira em <b>{mm}:{ss}</b></> : "Reserva expirada."}
    </span>
  );
}
