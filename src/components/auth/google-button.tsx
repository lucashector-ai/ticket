"use client";

import { useState } from "react";
import { loadAuthClient } from "@/lib/auth/client-lazy";
import { useToast } from "@/components/toast";

/** Volta do Google passando por /verificacao: pede o código da segunda etapa (se houver) e depois vai para `next`. */
export const viaVerify = (next: string) => `/verificacao?next=${encodeURIComponent(next || "/")}`;

export function GoogleButton({ label, next }: { label: string; next: string }) {
  const { flash } = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await (await loadAuthClient()).signIn.social({ provider: "google", callbackURL: viaVerify(next) });
      if (res?.error) {
        flash(res.error.message || "Não foi possível entrar com o Google.");
        setBusy(false);
      }
    } catch {
      flash("Não foi possível entrar com o Google. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <button className="lx-soc" type="button" onClick={go} disabled={busy} aria-busy={busy}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
        <path d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
        <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z" fill="#FBBC05" />
        <path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" fill="#EA4335" />
      </svg>
      {busy ? "Abrindo o Google…" : label}
    </button>
  );
}
