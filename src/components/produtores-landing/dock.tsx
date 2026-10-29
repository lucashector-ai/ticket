"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const LINKS = [
  { id: "como", label: "Como funciona" },
  { id: "recursos", label: "Recursos" },
  { id: "precos", label: "Preços" },
  { id: "faq", label: "Dúvidas" },
];

/**
 * Barra flutuante que aparece depois do hero: atalhos para as seções (com indicador
 * deslizante na seção atual) e o botão de criar evento. Some no CTA final e no rodapé.
 */
export function SectionDock() {
  const [show, setShow] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const hero = document.getElementById("pdl-hero");
    const ends = Array.from(document.querySelectorAll<HTMLElement>(".pdl-final, .ftr"));
    if (!hero) return;
    let heroIn = true;
    const endIn = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroIn = e.isIntersecting;
        else if (e.isIntersecting) endIn.add(e.target);
        else endIn.delete(e.target);
      }
      setShow(!heroIn && endIn.size === 0);
    });
    io.observe(hero);
    ends.forEach((el) => io.observe(el));

    const secs = LINKS.map((l) => document.getElementById(l.id)).filter((x): x is HTMLElement => !!x);
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    secs.forEach((s) => spy.observe(s));
    return () => {
      io.disconnect();
      spy.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const p = pill.current;
    const a = active ? nav.current?.querySelector<HTMLElement>(`a[href="#${active}"]`) : null;
    if (!p) return;
    if (!a) {
      p.style.opacity = "0";
      return;
    }
    p.style.opacity = "1";
    p.style.width = `${a.offsetWidth}px`;
    p.style.transform = `translateX(${a.offsetLeft}px)`;
  }, [active, show]);

  return (
    <div className={show ? "pdl-dock on" : "pdl-dock"} aria-hidden={!show} inert={!show}>
      <nav ref={nav} className="pdl-dn" aria-label="Seções da página">
        <span ref={pill} className="pdl-dp" aria-hidden="true" />
        {LINKS.map((l) => (
          <a key={l.id} href={`#${l.id}`} className={active === l.id ? "on" : undefined} aria-current={active === l.id ? "location" : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
      <span className="pdl-dt">
        <b>7,99%</b> por ingresso<span className="pdl-dtx"> · sem mensalidade</span>
      </span>
      <Link className="pdl-btn l sm" href="/criar-evento">
        Criar evento
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
      </Link>
    </div>
  );
}
