"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import type { HeaderUser } from "@/components/site-header";

/*
 * Navegação do celular (pedido do dono, a partir do HTML de referência):
 * - menu lateral que entra pela direita, com a conta em cima, os atalhos e o convite para produtores;
 * - folha de baixo para escolher a cidade (home);
 * - barra de abas fixa embaixo (Início, Explorar, Ingressos, Perfil), só até 760 px.
 * Menu e folha vão direto no <body>: o desfoque do topo prenderia um position:fixed dentro dele.
 */

const OUT_MS = 300;

function reduced() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Abre/fecha com animação de saída, Esc, foco preso dentro e devolvido a quem abriu, página travada atrás. */
export function useOverlay() {
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    opener.current = (document.activeElement as HTMLElement | null) ?? null;
    if (timer.current) clearTimeout(timer.current);
    setOut(false);
    setOpen(true);
  }, []);
  const hide = useCallback((restore = true) => {
    const done = () => {
      setOpen(false); setOut(false);
      if (restore) opener.current?.focus({ preventScroll: true });
    };
    if (reduced()) { done(); return; }
    setOut(true);
    timer.current = setTimeout(done, OUT_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { open, out, show, hide };
}

/** Prende o Tab dentro do painel, fecha com Esc e põe o foco no primeiro item ao abrir. */
function useTrap(box: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const items = () => [...el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,select,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [box, onClose]);
}

function Portal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

const Arrow = () => <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
const Close = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

function initials(u: NonNullable<HeaderUser>) {
  const n = (u.name ?? u.email ?? "").trim();
  const p = n.split(/[\s@.]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 && u.name ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/** Menu do celular: painel que entra pela direita. */
export function MenuPanel({ user, producer, out, onClose }: { user: HeaderUser; producer: boolean; out: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useTrap(box, onClose);
  const go = () => onClose();
  const items: { href: string; label: string }[] = [
    { href: "/", label: "Início" },
    { href: "/explorar", label: "Explorar eventos" },
    { href: "/meus-ingressos", label: "Meus ingressos" },
    ...(user ? [{ href: "/conta", label: "Minha conta" }] : []),
    ...(producer ? [{ href: "/painel", label: "Painel do produtor" }, { href: "/meus-eventos", label: "Meus eventos" }] : []),
    { href: "/ajuda", label: "Ajuda" },
  ];
  return (
    <Portal>
      <div className={out ? "mpn-ov out" : "mpn-ov"} onClick={onClose} aria-hidden="true" />
      <div className={out ? "mpn out" : "mpn"} role="dialog" aria-modal="true" aria-label="Menu" ref={box} tabIndex={-1}>
        <div className="mpn-h">
          <Link className="mpn-lg" href="/" onClick={go} aria-label="Tickets Win: início"><BrandLogo height={22} /></Link>
          <button className="mpn-x" type="button" onClick={onClose} aria-label="Fechar menu" data-autofocus><Close /></button>
        </div>
        {user ? (
          <Link className="mpn-acc" href="/conta" onClick={go}>
            <span className="mpn-av" aria-hidden="true">{initials(user)}</span>
            <span className="mpn-ai"><b>{user.name?.split(" ")[0] || "Sua conta"}</b><small>{user.email}</small></span>
          </Link>
        ) : (
          <Link className="mpn-acc" href="/entrar" onClick={go}>
            <span className="mpn-av" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" /></svg>
            </span>
            <span className="mpn-ai"><b>Entrar ou criar conta</b><small>Seus ingressos sempre à mão</small></span>
          </Link>
        )}
        <nav className="mpn-l" aria-label="Menu principal">
          {items.map((it, i) => (
            <Link key={it.href} className="mpn-i" href={it.href} onClick={go} style={{ animationDelay: `${0.1 + i * 0.035}s` }}>
              <span>{it.label}</span><Arrow />
            </Link>
          ))}
          {user && <SignOutButton className="mpn-i mpn-out" style={{ animationDelay: `${0.1 + items.length * 0.035}s` }}><span>Sair</span><Arrow /></SignOutButton>}
        </nav>
        <Link className="mpn-pr" href="/criar-evento" onClick={go}>
          <b className="mpn-pt">Produz eventos?</b>
          <span className="mpn-ps">Crie e publique grátis. Só 7,99% por ingresso pago vendido.</span>
          <span className="mpn-pc">Criar evento <Arrow /></span>
        </Link>
      </div>
    </Portal>
  );
}

export type CityChoice = { value: string; label: string; sub?: string };

/** Escolha da cidade no celular: folha que sobe de baixo. */
export function CitySheet({ cities, city, out, onPick, onClose }: { cities: CityChoice[]; city: string; out: boolean; onPick: (v: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useTrap(box, onClose);
  return (
    <Portal>
      <div className={out ? "mpn-ov out" : "mpn-ov"} onClick={onClose} aria-hidden="true" />
      <div className={out ? "csh out" : "csh"} role="dialog" aria-modal="true" aria-labelledby="csh-t" ref={box} tabIndex={-1}>
        <span className="csh-grab" aria-hidden="true" />
        <div className="csh-h">
          <h2 className="csh-t" id="csh-t">Escolha a cidade</h2>
          <button className="mpn-x" type="button" onClick={onClose} aria-label="Fechar"><Close /></button>
        </div>
        <div className="csh-l" role="radiogroup" aria-labelledby="csh-t">
          {cities.map((c, i) => {
            const on = c.value === city;
            return (
              <button key={c.value} className={on ? "csh-i on" : "csh-i"} type="button" role="radio" aria-checked={on} data-autofocus={on ? true : undefined} style={{ animationDelay: `${0.06 + Math.min(i, 8) * 0.03}s` }} onClick={() => { onPick(c.value); onClose(); }}>
                <span className="csh-n"><b>{c.label}</b>{c.sub && <small>{c.sub}</small>}</span>
                <span className="csh-ck" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Portal>
  );
}

type Tab = { href: string; label: string; on: (p: string) => boolean; icon: ReactNode };

/** Barra de abas do celular (até 760 px; escondida onde já existe uma barra fixa de compra ou de pagamento). */
export function TabBar({ user }: { user: HeaderUser }) {
  const path = usePathname() ?? "/";
  const [kb, setKb] = useState(false);

  // teclado aberto (a área visível encolhe): a barra sai para não cobrir o campo
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setKb(vv.height < window.innerHeight * 0.75);
    vv.addEventListener("resize", on);
    return () => vv.removeEventListener("resize", on);
  }, []);

  const tabs: Tab[] = [
    { href: "/", label: "Início", on: (p) => p === "/", icon: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" strokeLinejoin="round" /> },
    { href: "/explorar", label: "Explorar", on: (p) => p.startsWith("/explorar"), icon: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" strokeLinecap="round" /></> },
    { href: "/meus-ingressos", label: "Ingressos", on: (p) => p.startsWith("/meus-ingressos") || p.startsWith("/ingressos"), icon: <path d="M3 9.5a2 2 0 0 0 0 4v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" strokeLinejoin="round" /> },
    { href: user ? "/conta" : "/entrar", label: "Perfil", on: (p) => p.startsWith("/conta") || p.startsWith("/entrar") || p.startsWith("/cadastro"), icon: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" strokeLinecap="round" /></> },
  ];
  return (
    <nav className={kb ? "tbar kb" : "tbar"} aria-label="Navegação rápida">
      {tabs.map((t) => {
        const on = t.on(path);
        return (
          <Link key={t.label} className={on ? "tbar-i on" : "tbar-i"} href={t.href} aria-current={on ? "page" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
