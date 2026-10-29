"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Entradas ao rolar: marca a página com `pdl-anim` (só com JS e sem "reduzir movimento")
 * e adiciona `in` em cada `.pdl-rv` quando ele entra na tela.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pdl-main");
    if (!root || reducedMotion() || !("IntersectionObserver" in window)) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".pdl-rv"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    root.classList.add("pdl-anim");
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("pdl-anim");
    };
  }, []);
  return null;
}

export type NumFmt = "int" | "brl" | "brl2" | "dec1" | "dec2";

export function fmtNum(v: number, fmt: NumFmt) {
  switch (fmt) {
    case "brl":
      return "R$ " + Math.round(v).toLocaleString("pt-BR");
    case "brl2":
      return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "dec1":
      return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "dec2":
      return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    default:
      return Math.round(v).toLocaleString("pt-BR");
  }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Número animado: conta de 0 até `value` quando aparece na tela e,
 * depois disso, desliza do valor atual para o novo sempre que `value` muda.
 * O HTML do servidor já traz o valor final (SEO e sem JS).
 */
export function Num({ value, fmt = "int", dur = 1400, className }: { value: number; fmt?: NumFmt; dur?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const target = useRef(value);
  const started = useRef(false);
  const raf = useRef(0);

  const run = useCallback(
    (from: number, to: number) => {
      cancelAnimationFrame(raf.current);
      const d = reducedMotion() ? 0 : dur;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = d === 0 ? 1 : Math.min(1, (now - t0) / d);
        const v = from + (to - from) * ease(p);
        shownRef.current = v;
        setShown(v);
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [dur],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      started.current = true;
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        if (!reducedMotion()) run(0, target.current);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [run]);

  useEffect(() => {
    target.current = value;
    if (started.current) run(shownRef.current, value);
  }, [value, run]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <span ref={ref} className={className}>
      {fmtNum(shown, fmt)}
    </span>
  );
}

/** Luz que segue o cursor dentro dos cards marcados com `data-spot` (só mouse). */
export function Spotlight({ className, children }: { className?: string; children: React.ReactNode }) {
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-spot]");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--sx", `${e.clientX - r.left}px`);
    card.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div className={className} onPointerMove={onMove}>
      {children}
    </div>
  );
}

/**
 * Trilho com rolagem horizontal no celular (scroll-snap) e pontinhos de navegação.
 * No desktop o CSS mantém a grade normal e os pontinhos somem.
 */
export function SnapRail({ className, count, label, children }: { className: string; count: number; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t = 0;
    const onScroll = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => {
        const kids = Array.from(el.children) as HTMLElement[];
        if (!kids.length) return;
        const mid = el.scrollLeft + el.clientWidth / 2;
        let best = 0;
        let bestD = Infinity;
        kids.forEach((k, i) => {
          const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        setIdx(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(t);
    };
  }, []);

  const go = (i: number) => {
    const el = ref.current;
    const k = el?.children[i] as HTMLElement | undefined;
    if (!el || !k) return;
    el.scrollTo({ left: k.offsetLeft - (el.clientWidth - k.offsetWidth) / 2, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <>
      <div ref={ref} className={className}>
        {children}
      </div>
      <div className="pdl-dots" role="group" aria-label={label}>
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" className={i === idx ? "on" : undefined} aria-label={`Ir para o item ${i + 1}`} aria-current={i === idx ? "true" : undefined} onClick={() => go(i)} />
        ))}
      </div>
    </>
  );
}
