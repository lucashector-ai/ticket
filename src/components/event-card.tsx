"use client";

import Link from "next/link";
import { FlyerArt } from "@/components/art/flyer";
import { useFavorites } from "@/components/favorites";
import { useToast } from "@/components/toast";
import { brl } from "@/lib/format";
import type { EventCard as EventCardData } from "@/lib/data/events";

/** Card de evento padrão (grade da home, listagens, "você também pode curtir"). */
export function EventCard({ e, delay, className = "card rv" }: { e: EventCardData; delay?: string; className?: string }) {
  const { isFav, toggle } = useFavorites();
  const { flash } = useToast();
  const fav = isFav(e.slug);
  return (
    <article className={className} style={delay ? { animationDelay: delay } : undefined}>
      <Link className="cimg" href={`/eventos/${e.slug}`} aria-label={`Ver ${e.title}`}>
        <FlyerArt id={e.flyerId} />
        {e.categoryLabel && <span className="pill-w">{e.categoryLabel}</span>}
      </Link>
      <button
        className={fav ? "fav on" : "fav"}
        type="button"
        aria-pressed={fav}
        aria-label={fav ? `Remover ${e.title} dos salvos` : `Salvar ${e.title}`}
        onClick={async (ev) => { ev.preventDefault(); const saved = await toggle(e.slug); flash(saved ? `${e.title} foi salvo` : "Removido dos salvos"); }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
        </svg>
      </button>
      <div className="cbody">
        <h3><Link href={`/eventos/${e.slug}`}>{e.title}</Link></h3>
        <p className="cmeta">{e.dateNice}</p>
        <p className="cmeta">{e.venue}</p>
        <p className="cmeta mute">{e.city}, {e.uf}</p>
        <div className="cfoot">
          <span className="price">{e.minPriceCents ? <><small>A partir de</small>{brl(e.minPriceCents)}</> : "Grátis"}</span>
          <Link className="go" href={`/eventos/${e.slug}`} aria-label={`Ingressos para ${e.title}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
