"use client";

import { useState } from "react";

const ZONES = [
  { k: "palco", label: "Palco", color: "#F2F2EE", style: { left: 120, top: 14, width: 100, height: 30, z: 26 } },
  { k: "pista", label: "Pista", color: "#EDFF3C", style: { left: 70, top: 64, width: 200, height: 96, z: 6 } },
  { k: "cam", label: "Camarotes", color: "#FF5B1F", style: { left: 16, top: 64, width: 42, height: 140, z: 18 } },
  { k: "cam", label: "Camarotes", color: "#FF5B1F", style: { left: 282, top: 64, width: 42, height: 140, z: 18 } },
  { k: "bar", label: "Bar", color: "#7DF9FF", style: { left: 110, top: 172, width: 120, height: 34, z: 12 } },
];
const LEGEND = ZONES.filter((z, i) => ZONES.findIndex((o) => o.k === z.k) === i);

/** Mapa 3D em CSS: passar o mouse (ou tocar) na legenda destaca o setor. */
export function Map3D() {
  const [hl, setHl] = useState<string | null>(null);
  return (
    <>
      <div className={hl ? "pdl-3d has-hl" : "pdl-3d"} aria-hidden="true">
        <div className="pdl-3dp">
          <div className="fl" />
          {ZONES.map((z, i) => (
            <div
              key={i}
              className={hl === z.k ? "pdl-blk pdl-hl" : "pdl-blk"}
              style={{ left: z.style.left, top: z.style.top, width: z.style.width, height: z.style.height, background: z.color, "--z": `${z.style.z}px` } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="pdl-3dl" role="group" aria-label="Setores do mapa" onMouseLeave={() => setHl(null)}>
        {LEGEND.map((z) => (
          <button
            key={z.k}
            type="button"
            className={hl === z.k ? "on" : undefined}
            aria-pressed={hl === z.k}
            onMouseEnter={() => setHl(z.k)}
            onFocus={() => setHl(z.k)}
            onBlur={() => setHl(null)}
            onClick={() => setHl((v) => (v === z.k ? null : z.k))}
          >
            <i style={{ background: z.color }} />
            {z.label}
          </button>
        ))}
      </div>
    </>
  );
}
