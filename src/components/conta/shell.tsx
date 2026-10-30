"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  { href: "/conta", label: "Meus dados", icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0" /> },
  { href: "/conta/compras", label: "Minhas compras", icon: <path d="M5 7h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 7V5.5a3 3 0 0 1 6 0V7" /> },
  { href: "/conta/pagamentos", label: "Pagamentos", icon: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6.5 15h4" /></> },
  { href: "/conta/seguranca", label: "Privacidade e segurança", icon: <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6zM8.8 12.2l2.2 2.2 4.4-4.6" /> },
];

/** Menu lateral de Minha conta (vira abas roláveis no celular). */
export function ContaShell({ name, email, avatar, mfa, children }: { name: string; email: string; avatar: string | null; mfa: boolean; children: React.ReactNode }) {
  const path = usePathname();
  // celular: a aba atual sempre à vista na faixa rolável (em "Minhas compras" ela aparecia cortada)
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = nav.current, on = n?.querySelector<HTMLElement>("a.on");
    if (!n || !on || n.scrollWidth <= n.clientWidth) return;
    const a = n.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left < a.left || r.right > a.right) n.scrollBy({ left: r.left - a.left - 16 });
  }, [path]);
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "TW";
  return (
    <main className="wrap ct">
      <aside className="ct-side">
        <div className="ct-me">
          <span className="ct-av" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatar ? <img src={avatar} alt="" /> : initials}
          </span>
          <span className="ct-me-t"><b>{name || "Sua conta"}</b><span>{email}</span></span>
        </div>
        <nav className="ct-nav" aria-label="Minha conta" ref={nav}>
          {TABS.map((t) => {
            const on = t.href === "/conta" ? path === "/conta" : path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
                {t.label}
                {t.href === "/conta/seguranca" && !mfa && <i className="ct-dot" title="Ative a verificação em duas etapas" />}
              </Link>
            );
          })}
          <Link href="/meus-ingressos">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v7a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2z" /><path d="M14 6.5v11" strokeDasharray="1.5 2" /></svg>
            Meus ingressos
          </Link>
        </nav>
      </aside>
      <div className="ct-main">{children}</div>
    </main>
  );
}
