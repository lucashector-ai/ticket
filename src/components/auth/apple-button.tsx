"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

const MSG: Record<string, string> = {
  erro: "Não foi possível entrar com a Apple. Tente de novo ou use seu e-mail.",
  cancelado: "Login com a Apple cancelado.",
};

export const appleHref = (next: string) => `/api/apple/start?next=${encodeURIComponent(next || "/")}`;

export function AppleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" /></svg>
  );
}

/** Mostra o aviso quando a volta da Apple dá erro (/entrar?apple=erro) e limpa o parâmetro. */
export function useAppleNotice() {
  const { flash } = useToast();
  useEffect(() => {
    const u = new URL(window.location.href);
    const f = u.searchParams.get("apple");
    if (!f) return;
    if (MSG[f]) flash(MSG[f]);
    u.searchParams.delete("apple");
    window.history.replaceState(null, "", u.toString());
  }, [flash]);
}

/** "Continuar com a Apple" (padrão da Apple: botão preto com o logo). */
export function AppleButton({ next, className = "lx-soc lx-ap" }: { next: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  useAppleNotice();
  return (
    <a className={className} href={appleHref(next)} onClick={() => setBusy(true)} aria-busy={busy}>
      <AppleLogo />
      {busy ? "Abrindo a Apple…" : "Continuar com a Apple"}
    </a>
  );
}
