"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchDocs, type SearchDoc } from "@/lib/help/search";
import { IcArrow, IcClose, IcSearch } from "./icons";

const SUGGESTIONS = ["Reembolso", "Transferir", "Meia-entrada", "Taxa", "Pix", "Duas etapas"];

type Props = {
  docs: SearchDoc[];
  initialQ?: string;
  /** hero: busca grande da central (mantém ?q= na URL e esconde `children` durante a busca); inline: caixa compacta */
  variant?: "hero" | "inline";
  children?: React.ReactNode;
};

/** Busca instantânea da central de ajuda (sem acento, em título, resumo e texto dos artigos). */
export function HelpSearch({ docs, initialQ = "", variant = "hero", children }: Props) {
  const [q, setQ] = useState(initialQ);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const hero = variant === "hero";
  const results = useMemo(() => searchDocs(docs, q, hero ? 20 : 6), [docs, q, hero]);
  const active = q.trim().length > 0;

  // ?q= na URL (dá para compartilhar uma busca e voltar a ela)
  useEffect(() => {
    if (!hero) return;
    const t = setTimeout(() => {
      try {
        const u = new URL(window.location.href);
        const v = q.trim();
        if ((u.searchParams.get("q") ?? "") === v) return;
        if (v) u.searchParams.set("q", v); else u.searchParams.delete("q");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      } catch { /* sem URL: segue sem sincronizar */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, hero]);

  // um assunto aberto por âncora (/ajuda#reembolsos) precisa da lista de assuntos visível
  useEffect(() => {
    if (!hero) return;
    const clear = () => setQ("");
    window.addEventListener("hp:clear-search", clear);
    return () => window.removeEventListener("hp:clear-search", clear);
  }, [hero]);

  // "/" foca a busca (como em outros sites de ajuda)
  useEffect(() => {
    if (!hero) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hero]);

  const box = (
    <form className={hero ? "hp-sbox big" : "hp-sbox"} role="search" onSubmit={(e) => { e.preventDefault(); input.current?.blur(); }}>
      <span className="hp-sic"><IcSearch size={hero ? 22 : 18} /></span>
      <label className="sr-only" htmlFor={`${id}-q`}>Buscar na central de ajuda</label>
      <input
        ref={input}
        id={`${id}-q`}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Busque sua dúvida"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
        aria-controls={active ? `${id}-r` : undefined}
      />
      {/* sempre na página: o leitor de tela anuncia quantos artigos a busca achou */}
      <span className="sr" role="status">{active ? (results.length === 1 ? "1 artigo encontrado" : `${results.length} artigos encontrados`) : ""}</span>
      {active && (
        <button className="hp-sclr" type="button" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Limpar busca"><IcClose /></button>
      )}
    </form>
  );

  const list = active && (
    <div className="hp-res" id={`${id}-r`} aria-live="polite">
      {results.length ? (
        <>
          <p className="hp-res-n">{results.length === 1 ? "1 artigo encontrado" : `${results.length} artigos encontrados`}</p>
          <ul className="hp-res-l">
            {results.map((r) => (
              <li key={r.slug}>
                <Link className="hp-res-i" href={`/ajuda/${r.slug}`}>
                  <span className="hp-res-c">{r.catTitle}</span>
                  <b>{r.title}</b>
                  {hero && <span className="hp-res-s">{r.summary}</span>}
                  <span className="hp-res-a" aria-hidden="true"><IcArrow /></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="hp-none">
          <b>Nenhum resultado para &ldquo;{q.trim()}&rdquo;</b>
          <p>Tente outras palavras, como &ldquo;reembolso&rdquo; ou &ldquo;QR code&rdquo;. Se preferir, a gente responde pessoalmente.</p>
          <Link className="btn-p" href="/contato">Falar com o suporte <IcArrow /></Link>
        </div>
      )}
    </div>
  );

  if (!hero) return <div className="hp-inline">{box}{list}</div>;

  return (
    <>
      <section className="hp-hero" aria-labelledby={`${id}-t`}>
        <span className="eyebrow"><span className="dot" aria-hidden="true" />Central de ajuda</span>
        <h1 className="hp-h1" id={`${id}-t`}>Como podemos ajudar?</h1>
        <p className="hp-lead">Respostas para quem compra ingresso e para quem produz eventos. Digite sua dúvida e os artigos aparecem na hora.</p>
        {box}
        <div className="hp-chips" aria-label="Buscas comuns">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className={q === s ? "hp-chip on" : "hp-chip"} onClick={() => setQ(s)}>{s}</button>
          ))}
        </div>
      </section>
      {list}
      <div hidden={active}>{children}</div>
    </>
  );
}
