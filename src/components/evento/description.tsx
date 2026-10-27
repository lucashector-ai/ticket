"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const MAX_LINES = 15;

/** "Sobre o evento" com clamp de 15 linhas e "Ver mais/Ver menos", como no app.js do design. */
export function Description({ paragraphs }: { paragraphs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const [max, setMax] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const ps = el.querySelectorAll<HTMLParagraphElement>(".desc");
      if (!ps.length) return;
      const lh = parseFloat(window.getComputedStyle(ps[0]).lineHeight) || 29.7;
      const limit = Math.round(lh * MAX_LINES);
      const full = ps[ps.length - 1].getBoundingClientRect().bottom - ps[0].getBoundingClientRect().top;
      setMax(limit);
      setLong(full > limit + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [paragraphs]);

  if (!paragraphs.length) return null;
  const clamped = long && !open;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="blk-s">
      <h2>Sobre o evento</h2>
      <div ref={ref} className={clamped ? "desc-w clamp" : "desc-w"} id="sobre" style={{ "--dmax": `${max}px` } as CSSProperties}>
        {paragraphs.map((t, i) => <p className="desc" key={i}>{t}</p>)}
      </div>
      {long && (
        <button className="more-link" type="button" onClick={toggle} aria-expanded={open}>
          {open ? "Ver menos" : "Ver mais"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? "flip" : undefined}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
