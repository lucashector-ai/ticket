"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const onHash = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readHash = () => { try { return decodeURIComponent(window.location.hash.slice(1)).replace(/\D/g, "").slice(0, 6); } catch { return ""; } };

/** Lê o código do #hash, mostra em 6 casas e copia. */
export function CodeCopy() {
  // undefined no servidor (o hash só existe no navegador)
  const code = useSyncExternalStore(onHash, readHash, () => undefined);
  const [ok, setOk] = useState<boolean | null>(null);

  async function copy() {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(null), 2500); }
    catch { setOk(false); }
  }

  if (code === undefined) return <div className="cd-wait" aria-hidden="true" />;
  if (code.length !== 6) {
    return (
      <>
        <h1 className="cd-t">Não achamos o código</h1>
        <p className="cd-s">Este link não trouxe um código. Abra o e-mail de novo e copie os 6 números que aparecem nele.</p>
        <Link className="cd-b alt" href="/">Ir para a Tickets Win</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="cd-t">Seu código</h1>
      <div className="cd-code" aria-label={`Código ${code.split("").join(" ")}`}>
        {code.split("").map((d, i) => <span key={i} aria-hidden="true">{d}</span>)}
      </div>
      <button className={ok ? "cd-b on" : "cd-b"} type="button" onClick={() => void copy()}>
        {ok ? (
          <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Copiado!</>
        ) : (
          <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>Copiar código</>
        )}
      </button>
      <p className="cd-s" role="status">
        {ok === false ? "Não deu para copiar sozinho. Toque e segure nos números para copiar." : "Volte para a página onde pediu o código e cole."}
      </p>
    </>
  );
}
