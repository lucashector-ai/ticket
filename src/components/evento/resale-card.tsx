import Link from "next/link";
import { brl } from "@/lib/format";
import type { EventoData } from "./types";

/** Revenda oficial: ingressos anunciados por outros fãs, do mais barato ao mais caro. */
export function ResaleCard({ e, inline = false }: { e: EventoData; inline?: boolean }) {
  const offers = e.resale.offers;
  if (!offers.length) return null;
  const soldOut = e.tiers.length > 0 && e.tiers.every((t) => t.status !== "open" || t.available === 0);
  return (
    <div className={["rsl", soldOut && "hot", inline && "in-buy"].filter(Boolean).join(" ")} id="revenda">
      <div className="rsl-h">
        <h2>Revenda oficial</h2>
        <span>{offers.length} {offers.length === 1 ? "ingresso" : "ingressos"} de fãs</span>
      </div>
      <p className="rsl-s">{soldOut ? "Esgotado na venda oficial, mas ainda dá: compra" : "Compra"} segura, com QR code novo no seu nome. O ingresso de quem vendeu deixa de valer.</p>
      <ul className="rsl-l">
        {offers.slice(0, 8).map((o) => (
          <li key={o.id}>
            <i className="sec-sw" style={{ background: o.color ?? "#111" }} aria-hidden="true" />
            <span className="rsl-i"><b>{o.label}</b><small>{o.session ?? (o.mine ? "Seu anúncio" : "Revenda")}</small></span>
            <span className="rsl-p"><b>{brl(o.priceCents)}</b>{o.totalCents > o.priceCents && <small>{brl(o.totalCents)} com taxa</small>}</span>
            {o.mine ? <span className="rsl-me">Seu</span> : <Link className="rsl-go" href={`/checkout?evento=${e.slug}&revenda=${o.id}`}>Comprar</Link>}
          </li>
        ))}
      </ul>
      {offers.length > 8 && <span className="rsl-more">+ {offers.length - 8} anúncios</span>}
    </div>
  );
}
