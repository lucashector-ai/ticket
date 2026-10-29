"use client";

import Link from "next/link";
import { FlyerArt } from "@/components/art/flyer";
import { brl } from "@/lib/format";
import type { EventCard as EventCardData } from "@/lib/data/events";

/** Card de evento padrão (grade da home, listagens, "você também pode curtir"). */
export function EventCard({ e, delay, className = "card rv" }: { e: EventCardData; delay?: string; className?: string }) {
  return (
    <article className={className} style={delay ? { animationDelay: delay } : undefined}>
      <Link className="cimg" href={`/eventos/${e.slug}`} aria-label={`Ver ${e.title}`}>
        <FlyerArt id={e.flyerId} />
        {e.categoryLabel && <span className="pill-w">{e.categoryLabel}</span>}
      </Link>
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
