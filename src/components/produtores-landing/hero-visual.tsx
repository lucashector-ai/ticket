"use client";

import { useEffect, useRef, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { Num, reducedMotion } from "./motion";

const SALES = [
  { ini: "ML", name: "Marina", qty: 2, what: "Pista inteira", value: 178 },
  { ini: "JP", name: "João", qty: 1, what: "Camarote", value: 160 },
  { ini: "CD", name: "Carla", qty: 3, what: "Pista meia", value: 133 },
  { ini: "RK", name: "Rafael", qty: 1, what: "Meia social", value: 59 },
];

const BARS: { h: number; c?: "h" | "n" }[] = [
  { h: 18 }, { h: 14 }, { h: 22 }, { h: 30 }, { h: 20 }, { h: 26 }, { h: 44 }, { h: 38 }, { h: 28 },
  { h: 78, c: "h" }, { h: 52 }, { h: 46 }, { h: 40 }, { h: 55 }, { h: 92, c: "h" }, { h: 68 }, { h: 62 }, { h: 84, c: "n" },
];

const CAPACITY = 2000;

/** Painel "ao vivo" do hero: vendas entrando, receita e ingressos contando, ingresso flutuando. */
export function HeroVisual() {
  const [n, setN] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setN((v) => v + 1);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  // cada venda mostrada (depois da primeira) soma no painel
  let rev = 96480;
  let sold = 1420;
  for (let i = 1; i <= n; i++) {
    const s = SALES[i % SALES.length];
    rev += s.value;
    sold += s.qty;
  }
  const sale = SALES[n % SALES.length];
  const lot = Math.min(99, Math.round((sold / CAPACITY) * 100));
  const lastBar = 84 + ((n % 4) * 4);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || reducedMotion() || !box.current) return;
    const r = box.current.getBoundingClientRect();
    box.current.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    box.current.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const onLeave = () => {
    box.current?.style.setProperty("--mx", "0");
    box.current?.style.setProperty("--my", "0");
  };

  return (
    <div className="pdl-vis" ref={box} onPointerMove={onMove} onPointerLeave={onLeave} aria-hidden="true">
      <div className="pdl-dash">
        <div className="pdl-dh">
          <b>Baile do Futuro</b>
          <span className="pdl-live"><i />Ao vivo</span>
        </div>
        <div className="pdl-kp">
          <div className="pdl-kc">
            <span className="l">Receita líquida</span>
            <b><Num value={rev} fmt="brl" dur={1600} /></b>
            <em>+22% na semana</em>
          </div>
          <div className="pdl-kc">
            <span className="l">Ingressos vendidos</span>
            <b><Num value={sold} fmt="int" dur={1600} /></b>
            <em>{lot}% da lotação</em>
          </div>
        </div>
        <div className="pdl-ch">
          {BARS.map((b, i) => (
            <i key={i} className={b.c} style={{ height: `${i === BARS.length - 1 ? lastBar : b.h}%`, animationDelay: `${0.35 + i * 0.04}s` }} />
          ))}
        </div>
      </div>
      <div className="pdl-sale">
        <div className="pdl-sale-in" key={n}>
          <span className="av">{sale.ini}</span>
          <div>
            <b className="t">{sale.name} comprou {sale.qty} {sale.qty > 1 ? "ingressos" : "ingresso"}</b>
            <span className="ss">{sale.what} · agora</span>
          </div>
          <strong>R$ {sale.value}</strong>
        </div>
      </div>
      <div className="pdl-tk">
        <div className="pdl-tkf"><FlyerArt id="baile" /></div>
        <div className="pdl-tkb">
          <div>
            <b>Pista · 3º lote</b>
            <span>Sáb, 31 out · 22h</span>
          </div>
          <span className="pdl-qr">
            <svg viewBox="0 0 7 7" width="34" height="34" shapeRendering="crispEdges"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v3H6zM4 6h1v1H4zM5 5h1v1H5z" fill="#111" /></svg>
          </span>
        </div>
      </div>
    </div>
  );
}
