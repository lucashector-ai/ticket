"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { transferTicket } from "@/lib/actions/tickets";
import { Modal } from "./modal";
import { IcoClose } from "./icons";

type Props = {
  title: string;
  ticketId: string;
  /** posição no grupo (1-based) e total; omitidos na página de ingresso único */
  cur?: number;
  qty?: number;
  onClose: () => void;
  onDone: (email: string) => void;
};

export function TransferModal({ title, ticketId, cur, qty, onClose, onDone }: Props) {
  const [state, action, pending] = useActionState(transferTicket, null);
  const [email, setEmail] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    if (state?.ok && !sent.current) { sent.current = true; onDone(email.trim()); }
  }, [state, email, onDone]);

  const which = cur && qty && qty > 1 ? `o ingresso ${cur} de ${qty}` : "o ingresso";
  return (
    <Modal label="Transferir ingresso" className="mo-tr" onClose={onClose}>
      <div className="mo-h">
        <div>
          <span className="mo-k">Transferir ingresso</span>
          <b className="mo-t">{title}</b>
        </div>
        <button className="pl-x mo-x" type="button" onClick={onClose} aria-label="Fechar"><IcoClose /></button>
      </div>
      <p className="mo-p">Vamos enviar {which} para o e-mail abaixo. A pessoa recebe um link para aceitar. O QR code atual deixa de valer na hora; enquanto ela não aceitar, você pode cancelar.</p>
      <form action={action} className="mo-f">
        <input type="hidden" name="ticketId" value={ticketId} />
        <label className="fld">
          <span className="fld-l">E-mail de quem vai receber</span>
          <input className="fld-i" type="email" name="email" placeholder="nome@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
        </label>
        {state?.error && <p className="fld-err" role="alert">{state.error}</p>}
        <button className="go-b" type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar ingresso"}</button>
      </form>
    </Modal>
  );
}
