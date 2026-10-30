"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { BrandLogo } from "@/components/brand-logo";
import { useIsProducer } from "@/components/use-producer";
import { CitySheet, MenuPanel, TabBar, useOverlay, type CityChoice } from "@/components/mobile-nav";

export type HeaderUser = { id: string; name?: string | null; email?: string | null; image?: string | null } | null;

type Props = {
  user: HeaderUser;
  /** "home": busca com input e seletor de cidade; "default": link de busca + botão preto. */
  variant?: "home" | "default";
  /** Começa transparente sobre uma imagem/banner e fica branco ao rolar. */
  onImage?: boolean;
  /** Esconde o header quando a busca da home "gruda" (comportamento do design). */
  hideWhenStuck?: boolean;
  cities?: CityChoice[];
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
  const mn = useOverlay();
  const cs = useOverlay();
  const menu = mn.open;
  const producer = useIsProducer(user?.id);
  const openMenu = mn.show;

  // a busca grudada da home tem o próprio botão de menu (o header some quando ela gruda)
  useEffect(() => {
    const on = () => openMenu();
    window.addEventListener("tw:menu", on);
    return () => window.removeEventListener("tw:menu", on);
  }, [openMenu]);

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || 0) > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const cls = stuck && !menu ? "hdr is-s hide" : scrolled ? "hdr is-s" : menu ? "hdr" : onImage ? "hdr on-img" : "hdr";
  const isActive = (p: string) => (activePath === p ? "on" : undefined);

  return (
    <>
      <header className={cls}>
        <div className="wrap hdr-in">
          <Link className="logo" href="/" aria-label="Tickets Win: início">
            <BrandLogo height={24} />
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
            {user ? (
              <details className="umenu hide-m">
                <summary className="lnk" aria-label={`${firstName(user)}: sua conta`}>{firstName(user)}</summary>
                <div className="umenu-pop">
                  <Link href="/meus-ingressos">Meus ingressos</Link>
                  <Link href="/conta">Minha conta</Link>
                  {producer && <Link href="/painel">Painel do produtor</Link>}
                  {producer && <Link href="/meus-eventos">Meus eventos</Link>}
                  <SignOutButton />
                </div>
              </details>
            ) : (
              <Link className={`lnk hide-m ${activePath === "/entrar" ? "on" : ""}`} href="/entrar">Entrar</Link>
            )}
            <Link className={variant === "home" ? "btn-o hide-m" : "blk hide-m"} href="/criar-evento">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>
              Criar evento
            </Link>
            {variant === "home" && cities && (
              <button className="cityb only-m" type="button" onClick={cs.show} aria-haspopup="dialog" aria-expanded={cs.open} aria-label={`Cidade: ${cityLabel(cities, city)}. Trocar cidade`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                <span>{city === "all" ? "Todas" : cityLabel(cities, city)}</span>
              </button>
            )}
            <button className="ib only-m" type="button" onClick={openMenu} aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded={menu}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 9h16M4 15h16" /></svg>
            </button>
          </div>
        </div>
      </header>
      {menu && <MenuPanel user={user} producer={producer} out={mn.out} onClose={mn.hide} />}
      {cs.open && cities && <CitySheet cities={cities} city={city} out={cs.out} onPick={(v) => onCity?.(v)} onClose={cs.hide} />}
      <TabBar user={user} />
    </>
  );
}

function cityLabel(cities: CityChoice[], v: string) {
  return cities.find((c) => c.value === v)?.label ?? "Todas as cidades";
}

function firstName(u: NonNullable<HeaderUser>) {
  const n = (u.name ?? u.email ?? "Conta").trim();
  return n.split(/\s+/)[0];
}
