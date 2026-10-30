"use client";

import { useState, useTransition } from "react";
import { createListing } from "@/lib/actions/revenda";
import { money } from "@/lib/pricing";
import { IcoClose } from "./icons";
import { Modal } from "./modal";

/** Anunciar o ingresso na revenda oficial: preço até o máximo do evento e quanto a pessoa recebe. */
export function ResaleModal({ title, ticketId, faceCents, maxCents, onClose, onDone }: { title: string; ticketId: string; faceCents: number; maxCents: number; onClose: () => void; onDone: (id: string, priceCents: number) => void }) {
  const [value, setValue] = useState(((Math.min(faceCents, maxCents)) / 100).toFixed(2).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cents = Math.round(Number(value.replace(/\./g, "").replace(",", ".")) * 100) || 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createListing(ticketId, cents);
      if (r.ok) onDone(r.id, cents); else setError(r.error);
    });
  };
  return (
    <Modal label="Revender ingresso" className="mo-tr" onClose={onClose}>
      <div className="mo-h">
        <div>
          <span className="mo-k">Revenda oficial</span>
          <b className="mo-t">{title}</b>
        </div>
        <button className="pl-x mo-x" type="button" onClick={onClose} aria-label="Fechar"><IcoClose /></button>
      </div>
      <p className="mo-p">Seu ingresso aparece na página do evento para outros fãs. Quando alguém comprar, o seu QR code deixa de valer e o comprador recebe um novo.</p>
      <form className="mo-f" onSubmit={submit}>
        <label className="fld">
          <span className="fld-l">Preço de venda</span>
          <span className="rs-in"><em>R$</em><input autoComplete="off" className="fld-i" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d,.]/g, "")); setError(null); }} autoFocus /></span>
        </label>
        <div className="rs-sum">
          <span>Você pagou <b>{money(faceCents)}</b> · máximo permitido <b>{money(maxCents)}</b></span>
          <span>Você recebe <b className="rs-get">{money(Math.round(cents * 0.95))}</b> <small>(menos a taxa de 5% da revenda)</small></span>
        </div>
        {error && <p className="fld-err" role="alert">{error}</p>}
        <button className="go-b" type="submit" disabled={pending || cents < 500 || cents > maxCents}>{pending ? "Anunciando…" : "Anunciar na revenda"}</button>
      </form>
    </Modal>
  );
}
