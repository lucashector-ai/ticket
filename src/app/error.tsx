"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="pg-inst">
      <SiteHeader user={null} variant="default" />
      <main className="wrap in-404">
        <p className="big" aria-hidden="true">Ops</p>
        <h1>Alguma coisa deu errado por aqui.</h1>
        <p>Não foi culpa sua. Já fomos avisados e, na maioria das vezes, tentar de novo resolve.</p>
        <div className="in-acts">
          <button className="btn-p" type="button" onClick={reset}>
            Tentar de novo
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
          </button>
          <Link className="btn-g" href="/">Voltar ao início</Link>
          <Link className="btn-g" href="/ajuda">Central de ajuda</Link>
        </div>
        {error.digest && <code>Código do erro: {error.digest}</code>}
      </main>
      <SiteFooter />
    </div>
  );
}
