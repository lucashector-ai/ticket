"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { IcCheck, IcThumb } from "./icons";

type Vote = "sim" | "nao" | null;
const key = (slug: string) => `tw-ajuda-voto:${slug}`;

/* voto guardado no navegador: lido como "loja externa" (nada no servidor, nada no primeiro render) */
const EVT = "tw-ajuda-voto";
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVT, cb); };
}
function readVote(slug: string): Vote {
  try {
    const v = window.localStorage.getItem(key(slug));
    return v === "sim" || v === "nao" ? v : null;
  } catch { return null; /* armazenamento bloqueado */ }
}

/** "Isso te ajudou?" (fica só no navegador da pessoa). */
export function HelpFeedback({ slug, subject }: { slug: string; subject: string }) {
  const stored = useSyncExternalStore(subscribe, () => readVote(slug), () => null);
  // sem armazenamento (aba anônima, bloqueio), o voto vale só nesta visita
  const [local, setLocal] = useState<{ slug: string; v: Vote }>({ slug, v: null });
  const vote = (local.slug === slug ? local.v : null) ?? stored;

  function pick(v: Exclude<Vote, null>) {
    setLocal({ slug, v });
    try {
      window.localStorage.setItem(key(slug), v);
      window.dispatchEvent(new Event(EVT));
    } catch { /* sem armazenamento */ }
  }

  return (
    <section className="hp-fb" aria-live="polite" aria-label="Avaliação do artigo">
      {vote === null && (
        <>
          <b>Isso te ajudou?</b>
          <div className="hp-fb-b">
            <button type="button" onClick={() => pick("sim")}><IcThumb />Sim</button>
            <button type="button" onClick={() => pick("nao")}><IcThumb down />Não</button>
          </div>
        </>
      )}
      {vote === "sim" && (
        <p className="hp-fb-ok"><span aria-hidden="true"><IcCheck /></span>Que bom! Obrigado por contar.</p>
      )}
      {vote === "nao" && (
        <div className="hp-fb-no">
          <p><b>Poxa, que pena.</b> Conta para a gente o que faltou e respondemos em até 1 dia útil.</p>
          <div className="hp-fb-b">
            <Link className="btn-p sm" href={`/contato?assunto=${subject}&artigo=${slug}`}>Falar com o suporte</Link>
            <button type="button" className="lnk-b" onClick={() => pick("sim")}>Mudei de ideia, ajudou</button>
          </div>
        </div>
      )}
    </section>
  );
}
