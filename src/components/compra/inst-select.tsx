"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { money } from "@/lib/pricing";

export type InstOpt = { n: number; eachCents: number; totalCents: number; interestFree: boolean };

/**
 * Parcelas do cartão num menu no visual do site (a mesma lista do Estado/Cidade, sem busca):
 * fechado mostra "1x R$ 296,97 sem juros"; aberto, cada opção com "sem juros" ou "com juros · total".
 * Teclado como um select: setas, Home/End, Enter/Espaço escolhe, Esc fecha. `blocked`: parcelas que o
 * banco recusou para o cartão digitado (continuam na lista, marcadas, para dar para trocar de cartão).
 */
export function InstSelect({ options, value, onChange, blocked, id }: {
  options: InstOpt[]; value: number; onChange: (n: number) => void; blocked?: number[] | null; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [up, setUp] = useState(false);
  const lb = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const cur = options.find((o) => o.n === value) ?? options[0];
  const no = (o: InstOpt) => !!blocked && o.n > 1 && !blocked.includes(o.n);
  const sub = (o: InstOpt) => (no(o) ? "indisponível neste cartão" : o.interestFree ? "sem juros" : `com juros · total ${money(o.totalCents)}`);

  const show = () => { setHi(Math.max(0, options.findIndex((o) => o.n === value))); setOpen(true); };
  const close = (focus = false) => { setOpen(false); if (focus) btn.current?.focus(); };
  const pick = (n: number) => { onChange(n); close(true); };
  // perto do fim da tela (ou da barra de pagar no celular), a lista abre para cima
  useLayoutEffect(() => {
    if (!open || !btn.current || !listRef.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = listRef.current.offsetHeight;
    const bar = document.querySelector(".ck-cta")?.getBoundingClientRect();
    const floor = bar && bar.top > r.bottom && getComputedStyle(document.querySelector(".ck-cta")!).position === "fixed" ? bar.top : window.innerHeight;
    setUp(floor - r.bottom < h + 12 && r.top > floor - r.bottom);
  }, [open]);
  useEffect(() => { if (open) listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" }); }, [open, hi]);

  return (
    <div className="cs is" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <button
        ref={btn} id={id} type="button" className="is-b" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={lb}
        aria-activedescendant={open ? `${lb}-${options[hi]?.n}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          const last = options.length - 1;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) show(); else setHi((h) => Math.max(0, Math.min(last, h + (e.key === "ArrowDown" ? 1 : -1)))); }
          else if (open && e.key === "Home") { e.preventDefault(); setHi(0); }
          else if (open && e.key === "End") { e.preventDefault(); setHi(last); }
          else if (open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (options[hi]) pick(options[hi].n); }
          else if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }}
      >
        <span className="is-v"><b>{cur.n}x {money(cur.eachCents)}</b> <span className={no(cur) ? "is-s bad" : "is-s"}>{sub(cur)}</span></span>
      </button>
      {open && (
        <ul className={up ? "cs-pop is-pop up" : "cs-pop is-pop"} id={lb} role="listbox" aria-label="Parcelas" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <li key={o.n} id={`${lb}-${o.n}`} role="option" aria-selected={o.n === value} className={[i === hi ? "hi" : "", o.n === value ? "on" : "", no(o) ? "no" : ""].filter(Boolean).join(" ") || undefined}
              onMouseEnter={() => setHi(i)} onClick={() => pick(o.n)}>
              <b>{o.n}x {money(o.eachCents)}</b><small>{sub(o)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
