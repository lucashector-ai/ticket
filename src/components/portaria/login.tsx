"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { enterWithCode } from "@/lib/actions/portaria";
import { InstallHint } from "./install";

const fmt = (v: string) => { const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s; };

/** Entrada da portaria: o código de acesso do evento (criado no painel do produtor). */
export function PortariaLogin({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(linkError ? "Esse link de acesso foi desligado ou o evento já acabou. Peça um novo ao produtor." : null);
  const [busy, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace("-", "").length !== 8) { setErr("O código tem 8 letras e números, como K7PX-3MQ9."); return; }
    start(async () => {
      const r = await enterWithCode(code);
      if (!r.ok) { setErr(r.error); return; }
      router.refresh();
    });
  };
  return (
    <main className="pt-login">
      <div className="pt-brand"><BrandLogo /><span>Portaria</span></div>
      <form className="pt-card" onSubmit={submit} noValidate>
        <h1>Check-in do evento</h1>
        <p>Digite o código de acesso que o produtor passou para a equipe. Ele fica no painel do evento, em Check-in.</p>
        <input className="pt-code" value={code} onChange={(e) => { setCode(fmt(e.target.value)); setErr(null); }} placeholder="XXXX-XXXX" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} inputMode="text" aria-label="Código de acesso" autoFocus />
        {err && <p className="pt-err" role="alert">{err}</p>}
        <button className="pt-go" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
      <InstallHint />
      <p className="pt-foot">Só a equipe do evento deve ter o código. O produtor pode desligar o acesso a qualquer momento.</p>
    </main>
  );
}
