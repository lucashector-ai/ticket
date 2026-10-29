"use client";

import { useEffect } from "react";

/**
 * Movimento da página "Sobre nós" (só com JS e sem "reduzir movimento"):
 * - `.sob-rv` entram ao rolar (marca `data-in`; a página ganha a classe `sob-anim`);
 * - `[data-par="0.1"]` desliza em parallax (mede o pai, escreve `--par` no elemento);
 * - `[data-prog]` recebe `--p` de 0 a 1 conforme atravessa a tela (linha do tempo, citação).
 * Sem JS, o CSS mostra tudo no estado final.
 */
export function SobreMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".sob-main");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            (e.target as HTMLElement).dataset.in = "";
            io?.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0 },
      );
      root.classList.add("sob-anim");
      root.querySelectorAll<HTMLElement>(".sob-rv").forEach((el) => io?.observe(el));
    }

    const par = Array.from(root.querySelectorAll<HTMLElement>("[data-par]"));
    const prog = Array.from(root.querySelectorAll<HTMLElement>("[data-prog]"));
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      for (const el of par) {
        const r = (el.parentElement ?? el).getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        const k = Number(el.dataset.par) || 0.1;
        el.style.setProperty("--par", `${((r.top + r.height / 2 - vh / 2) * k).toFixed(1)}px`);
      }
      for (const el of prog) {
        const r = el.getBoundingClientRect();
        const start = vh * 0.85;
        const end = vh * (Number(el.dataset.prog) || 0.5);
        const p = Math.min(1, Math.max(0, (start - r.top) / (r.height + start - end)));
        el.style.setProperty("--p", p.toFixed(3));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.classList.remove("sob-anim");
      [...par, ...prog].forEach((el) => {
        el.style.removeProperty("--par");
        el.style.removeProperty("--p");
      });
    };
  }, []);
  return null;
}
