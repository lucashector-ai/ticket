"use client";

import { useState } from "react";
import { isFixedArea, MAP_AREAS, MAP_CAPACITY, MapStage, VIEW_3D, type MapView } from "@/components/mapa3d";
import { brl } from "@/lib/format";
import type { EventoData } from "./types";
import type { Tickets } from "./use-tickets";

/** Mapa 3D do local na página do evento: tocar numa área ou setor mostra os ingressos dele. */
export function VenueMap({ e, t }: { e: EventoData; t: Tickets }) {
  const map = e.venueMap!;
  const [view, setView] = useState<MapView>(VIEW_3D);
  const [sel, setSel] = useState<string | null>(null);
  const sectors = [...new Map(Object.values(map).map((s) => [s.name, s])).values()];
  const pick = (name: string) => {
    t.setSector(t.sector === name ? null : name);
    if (window.matchMedia("(max-width: 1024px)").matches) document.getElementById("ingressos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const fromOf = (name: string) => {
    const prices = e.tiers.filter((x) => x.sector === name && x.status === "open").map((x) => x.priceCents);
    return prices.length ? `a partir de ${brl(Math.min(...prices))}` : "Esgotado";
  };
  const capOf = (name: string) => MAP_AREAS.filter((a) => !isFixedArea(a) && map[a.id]?.name === name).reduce((s, a) => s + a.cap, 0);
  return (
    <div className="blk-s" id="mapa" style={{ scrollMarginTop: 100 }}>
      <h2>Mapa do local</h2>
      <div className="m3 m3w vm">
        <MapStage
          sectorOf={(id) => map[id]}
          sel={sel}
          onPick={(id) => { setSel(id); const s = map[id]; if (s) pick(s.name); }}
          view={view}
          setView={setView}
          tag={`Escala aproximada · ${MAP_CAPACITY.toLocaleString("pt-BR")} pessoas`}
        />
        <div className="m3-side">
          <div className="m3-sh"><b className="m3-t">Setores</b><span className="m3-s">Toque num setor para ver os ingressos dele.</span></div>
          {sectors.map((s) => (
            <button key={s.name} type="button" className={t.sector === s.name ? "al sel" : "al"} onClick={() => pick(s.name)} aria-pressed={t.sector === s.name}>
              <span className="al-sw" style={{ background: s.color }} aria-hidden="true" />
              <span className="al-i"><b className="al-n">{s.name}</b><span className="al-c">{fromOf(s.name)} · {capOf(s.name).toLocaleString("pt-BR")} lugares</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
