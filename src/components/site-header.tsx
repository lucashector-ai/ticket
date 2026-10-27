"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFavorites } from "@/components/favorites";
import { signOut } from "@/lib/actions/auth";

export type HeaderUser = { id: string; name?: string | null; email?: string | null; image?: string | null } | null;

type Props = {
  user: HeaderUser;
  /** "home": busca com input e seletor de cidade; "default": link de busca + botão preto. */
  variant?: "home" | "default";
  /** Começa transparente sobre uma imagem/banner e fica branco ao rolar. */
  onImage?: boolean;
  /** Esconde o header quando a busca da home "gruda" (comportamento do design). */
  hideWhenStuck?: boolean;
  cities?: { value: string; label: string }[];
  city?: string;
  onCity?: (v: string) => void;
  /** @deprecated a home não mostra mais busca no cabeçalho */
  query?: string;
  /** @deprecated */
  onQuery?: (v: string) => void;
  /** @deprecated */
  onSearchSubmit?: () => void;
  stuck?: boolean;
  activePath?: string;
};

export function SiteHeader({ user, variant = "default", onImage = false, cities, city = "all", onCity, stuck = false, activePath }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const { favs } = useFavorites();

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.documentElement.style.overflow = menu ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [menu]);

  const cls = stuck && !menu ? "hdr is-s hide" : scrolled ? "hdr is-s" : menu ? "hdr" : onImage ? "hdr on-img" : "hdr";
  const isActive = (p: string) => (activePath === p ? "on" : undefined);

  return (
    <>
      <header className={cls}>
        <div className="wrap hdr-in">
          <Link className="logo" href="/" aria-label="Onde — início">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="logo-c" cx="12" cy="12" r="11" fill="#111111" />
              <circle className="sig-ring" cx="15.6" cy="8.4" r="3.4" fill="none" stroke="#D3F55B" strokeWidth="1" />
              <circle cx="15.6" cy="8.4" r="3.4" fill="#D3F55B" />
            </svg>
            Onde
          </Link>
          {/* na home a busca fica só na barra grande da vitrine */}
          {variant !== "home" && (
            <Link className="hs" href="/explorar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" />
              </svg>
              Pesquisar eventos
            </Link>
          )}
          <nav className="nav" aria-label="Principal">
            <Link href="/explorar" className={isActive("/explorar")}>Explorar</Link>
            <Link href="/#destaque">Eventos</Link>
            <Link href="/#categorias">Categorias</Link>
          </nav>
          <div className="hdr-r">
            {variant === "home" && cities && (
              <label className="cityp hide-m">
                <span className="sr">Cidade</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.3" />
                </svg>
                <select value={city} onChange={(e) => onCity?.(e.target.value)}>
                  {cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <svg className="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
              </label>
            )}
            <Link className="ib hide-m" href="/explorar?salvos=1" aria-label="Eventos salvos">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
              </svg>
              {favs.length > 0 && <span className="badge">{favs.length}</span>}
            </Link>
            <Link className={`lnk hide-m ${activePath === "/meus-ingressos" ? "on" : ""}`} href="/meus-ingressos">Meus ingressos</Link>
            {user ? (
              <details className="umenu hide-m">
                <summary className="lnk" aria-label="Sua conta">{firstName(user)}</summary>
                <div className="umenu-pop">
                  <Link href="/meus-ingressos">Meus ingressos</Link>
                  <Link href="/explorar?salvos=1">Eventos salvos</Link>
                  <form action={signOut}><button type="submit">Sair</button></form>
                </div>
              </details>
            ) : (
              <Link className={`lnk hide-m ${activePath === "/entrar" ? "on" : ""}`} href="/entrar">Entrar</Link>
            )}
            <Link className={variant === "home" ? "btn-o hide-m" : "blk hide-m"} href="/produtores">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>
              Criar evento
            </Link>
            <button className="ib only-m" type="button" onClick={() => setMenu((m) => !m)} aria-label={menu ? "Fechar menu" : "Abrir menu"} aria-expanded={menu}>
              {menu ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 9h16M4 15h16" /></svg>
              )}
            </button>
          </div>
        </div>
      </header>
      {menu && (
        <div className="mm" role="dialog" aria-label="Menu">
          <div className="wrap">
            <Link href="/explorar" onClick={() => setMenu(false)} style={{ animationDelay: ".04s" }}>Explorar <span className="mute" aria-hidden="true">→</span></Link>
            <Link href="/#destaque" onClick={() => setMenu(false)} style={{ animationDelay: ".08s" }}>Eventos <span className="mute" aria-hidden="true">→</span></Link>
            <Link href="/#categorias" onClick={() => setMenu(false)} style={{ animationDelay: ".12s" }}>Categorias <span className="mute" aria-hidden="true">→</span></Link>
            <Link href="/meus-ingressos" onClick={() => setMenu(false)} style={{ animationDelay: ".16s" }}>Meus ingressos <span className="mute" aria-hidden="true">→</span></Link>
            {user ? (
              <form action={signOut}><button className="mm-b" type="submit" style={{ animationDelay: ".2s" }}>Sair <span className="mute" aria-hidden="true">→</span></button></form>
            ) : (
              <Link href="/entrar" onClick={() => setMenu(false)} style={{ animationDelay: ".2s" }}>Entrar <span className="mute" aria-hidden="true">→</span></Link>
            )}
            {cities && (
              <label className="fld" style={{ padding: "18px 0 0", background: "transparent" }}>
                <span>Cidade</span>
                <select value={city} onChange={(e) => onCity?.(e.target.value)} style={{ fontSize: "20px", height: "32px" }}>
                  {cities.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            )}
            <Link className="btn-p" href="/produtores" style={{ marginTop: "28px" }}>Criar evento</Link>
          </div>
        </div>
      )}
    </>
  );
}

function firstName(u: NonNullable<HeaderUser>) {
  const n = (u.name ?? u.email ?? "Conta").trim();
  return n.split(/\s+/)[0];
}
