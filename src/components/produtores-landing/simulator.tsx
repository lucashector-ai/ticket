"use client";

import { useId, useState } from "react";
import { Num, fmtNum } from "./motion";

export const FEE = 0.0799;

const PRICE = { min: 10, max: 500, step: 5 };
const QTY = { min: 50, max: 10000, step: 50 };
const PRESETS = [
  { label: "Festa", price: 60, qty: 800 },
  { label: "Show", price: 120, qty: 3000 },
  { label: "Festival", price: 350, qty: 9000 },
];

const pct = (v: number, r: { min: number; max: number }) => (((v - r.min) / (r.max - r.min)) * 100).toFixed(1) + "%";

/** Simulador de repasse com a taxa da plataforma (7,99% por ingresso pago). */
export function Simulator() {
  const [price, setPrice] = useState(80);
  const [qty, setQty] = useState(1500);
  const [pass, setPass] = useState(true);
  const id = useId();

  const fee = price * FEE;
  const buyer = pass ? price + fee : price;
  const net = (pass ? price : price - fee) * qty;

  return (
    <div className="pdl-sim">
      <div className="pdl-simh">
        <h3>Simule seu evento</h3>
        <div className="pdl-pre" role="group" aria-label="Exemplos prontos">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={p.price === price && p.qty === qty ? "on" : undefined}
              onClick={() => {
                setPrice(p.price);
                setQty(p.qty);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pdl-fd">
        <label className="pdl-fdh" htmlFor={`${id}-p`}>
          <span>Preço do ingresso</span>
          <b>{fmtNum(price, "brl")}</b>
        </label>
        <input
          id={`${id}-p`}
          className="pdl-rng"
          type="range"
          min={PRICE.min}
          max={PRICE.max}
          step={PRICE.step}
          value={price}
          onChange={(e) => setPrice(+e.target.value)}
          style={{ "--p": pct(price, PRICE) } as React.CSSProperties}
          aria-valuetext={fmtNum(price, "brl")}
        />
      </div>
      <div className="pdl-fd">
        <label className="pdl-fdh" htmlFor={`${id}-q`}>
          <span>Ingressos vendidos</span>
          <b>{fmtNum(qty, "int")}</b>
        </label>
        <input
          id={`${id}-q`}
          className="pdl-rng"
          type="range"
          min={QTY.min}
          max={QTY.max}
          step={QTY.step}
          value={qty}
          onChange={(e) => setQty(+e.target.value)}
          style={{ "--p": pct(qty, QTY) } as React.CSSProperties}
          aria-valuetext={`${fmtNum(qty, "int")} ingressos`}
        />
      </div>
      <button className={pass ? "pdl-tg on" : "pdl-tg"} type="button" role="switch" aria-checked={pass} onClick={() => setPass((v) => !v)}>
        <span className="pdl-sw" aria-hidden="true" />
        <span>
          <b>Repassar a taxa ao comprador</b>
          <span className="ts">{pass ? `O comprador paga ${fmtNum(fee, "brl2")} a mais e você recebe o valor cheio.` : "A taxa sai do valor do ingresso."}</span>
        </span>
      </button>
      <div className="pdl-res">
        <div className="pdl-rr"><span>Comprador paga por ingresso</span><b>{fmtNum(buyer, "brl2")}</b></div>
        <div className="pdl-rr"><span>Taxa Tickets Win (7,99%)</span><b>{fmtNum(fee * qty, "brl")}</b></div>
        <div className="pdl-rr tot"><span>Você recebe</span><b><Num value={net} fmt="brl" dur={650} /></b></div>
      </div>
      <p className="pdl-note">Valores estimados. Parcelamento no cartão pode ter juros pagos pelo comprador.</p>
    </div>
  );
}
