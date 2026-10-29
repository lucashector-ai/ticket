"use client";

import { useMemo, useState } from "react";
import { MapStage, VIEW_3D, type MapView } from "@/components/mapa3d";
import { AREA_KINDS, KIND_COLOR, type AreaKind, type VenuePlan } from "@/lib/criar/plan";
import { brl } from "@/lib/format";
import type { EventoData } from "./types";
import type { Tickets } from "./use-tickets";

/** Mapa 3D do local na página do evento: tocar numa área ou setor mostra os ingressos dele. */
export function VenueMap({ e, t }: { e: EventoData; t: Tickets }) {
  const data = e.venueMap!;
  const [view, setView] = useState<MapView>(VIEW_3D);
  const [sel, setSel] = useState<string | null>(null);
  const plan: VenuePlan = useMemo(() => ({
    width: data.width, depth: data.depth, notes: [], source: "ia", floor: data.floor,
    areas: data.areas.map((a) => ({ ...a, cap: 0, kind: ((AREA_KINDS as readonly string[]).includes(a.kind) ? a.kind : "outro") as AreaKind, sector: a.sectorName })),
  }), [data]);
  const byId = new Map(data.areas.map((a) => [a.id, a]));
  const sectors = [...new Map(data.areas.filter((a) => a.sectorName).map((a) => [a.sectorName!, { name: a.sectorName!, color: a.color }])).values()];
  const pick = (name: string) => {
    t.setSector(t.sector === name ? null : name);
    if (window.matchMedia("(max-width: 1024px)").matches) document.getElementById("ingressos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const fromOf = (name: string) => {
    const prices = e.tiers.filter((x) => x.sector === name && x.status === "open").map((x) => x.priceCents);
    return prices.length ? `a partir de ${brl(Math.min(...prices))}` : "Esgotado";
  };
  return (
    <div className="blk-s" id="mapa" style={{ scrollMarginTop: 100 }}>
      <h2>Mapa do local</h2>
      <div className="m3 m3w vm">
        <MapStage
          plan={plan}
          look={(a) => ({ name: byId.get(a.id)?.sectorName ?? a.name, color: byId.get(a.id)?.color ?? (a.kind !== "setor" ? KIND_COLOR[a.kind] : "#B9B2A4") })}
          sel={sel}
          onPick={(id) => { setSel(id); const s = byId.get(id)?.sectorName; if (s) pick(s); }}
          view={view}
          setView={setView}
        />
        {sectors.length > 0 && (
          <div className="m3-side">
            <div className="m3-sh"><b className="m3-t">Setores</b><span className="m3-s">Toque num setor para ver os ingressos dele.</span></div>
            {sectors.map((s) => (
              <button key={s.name} type="button" className={t.sector === s.name ? "al sel" : "al"} onClick={() => pick(s.name)} aria-pressed={t.sector === s.name}>
                <span className="al-sw" style={{ background: s.color }} aria-hidden="true" />
                <span className="al-i"><b className="al-n">{s.name}</b><span className="al-c">{fromOf(s.name)}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
