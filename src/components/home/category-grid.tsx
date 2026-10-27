"use client";

import { FlyerArt } from "@/components/art/flyer";
import type { HomeCategory } from "./types";

function CatIcon({ slug }: { slug: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (slug) {
    case "festas":
      return <svg {...common}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>;
    case "festivais":
      return <svg {...common}><path d="M3 20h18M5 20L12 5l7 15M12 5v15M12 5V2.5l3 1.2-3 1.3" /></svg>;
    case "eletronica":
      return <svg {...common}><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" /></svg>;
    case "hiphop":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" /></svg>;
    case "arte":
      return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5" /><circle cx="15.5" cy="8.5" r="1.5" /></svg>;
    case "experiencias":
      return <svg {...common}><path d="M3.5 8.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v7a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2z" /><path d="M14 6.5v11" strokeDasharray="1.5 2" /></svg>;
    default: // shows e demais
      return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>;
  }
}

/** Grade "Explore por categoria" (primeira categoria em destaque, com flyer de capa e contagem). */
export function CategoryGrid({ categories, onPick }: { categories: HomeCategory[]; onPick: (slug: string) => void }) {
  return (
    <div className="catg">
      {categories.map((c, i) => (
        <button key={c.slug} className={i === 0 ? "cat big rv" : "cat rv"} type="button" onClick={() => onPick(c.slug)} aria-label={`Ver eventos de ${c.name}`}>
          <span className="cat-ic" aria-hidden="true"><CatIcon slug={c.slug} /></span>
          <span className="cat-n">
            <b>{c.name}</b>
            <span>{c.count === 1 ? "1 evento" : `${c.count} eventos`}</span>
          </span>
          <span className="cat-pic" aria-hidden="true"><FlyerArt id={c.coverFlyer} /></span>
        </button>
      ))}
    </div>
  );
}
