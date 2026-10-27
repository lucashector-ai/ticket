"use client";

import Link from "next/link";
import { useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { TICKET_STATUS_LABEL } from "@/lib/tickets/labels";
import { HelpStrip } from "./help-strip";
import { IcoArrow, IcoBack, IcoCalendar, IcoClose, IcoPin, IcoSun, IcoTicket, IcoUser } from "./icons";
import { Modal } from "./modal";
import { TransferModal } from "./transfer-modal";
import { WalletButtons, type WalletFlags } from "./wallet-buttons";
import type { TicketItem } from "./types";

export type TicketViewData = {
  ticket: TicketItem;
  eventSlug: string;
  title: string;
  flyerId: string;
  upcoming: boolean;
  countdown: string;
  dateFull: string;
  dateNice: string;
  doors: string;
  venue: string;
  addr: string;
  tier: string;
  orderNumber: number | null;
  checkedInLabel: string | null;
  wallet: WalletFlags;
};

export function TicketView({ data }: { data: TicketViewData }) {
  const { flash } = useToast();
  const [transfer, setTransfer] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const t = data.ticket;
  const status = movedTo ? "transferred" : t.status;
  const valid = status === "valid";

  const kicker = !data.upcoming ? "Evento encerrado" : status === "valid" ? data.countdown : TICKET_STATUS_LABEL[status];
  const holder = movedTo ? `Transferido para ${movedTo}` : status === "transferred" ? "Transferido" : `Titular: ${t.holderName ?? "—"}`;

  return (
    <main className="wrap mi mi-one">
      <div className="crumb">
        <Link href="/meus-ingressos"><IcoBack />Meus ingressos</Link>
      </div>
      <div className="mi-h">
        <div>
          <h1 className="mi-t">Seu ingresso</h1>
          <p className="mi-s">Mostre este QR code na entrada. Ele funciona mesmo sem internet.</p>
        </div>
        <span className={`tk-st tk-st-${status}`}>{TICKET_STATUS_LABEL[status]}</span>
      </div>

      <article className="tkb" aria-label={`Ingresso para ${data.title}`}>
        <Link className="tkb-art" href={`/eventos/${data.eventSlug}`} aria-label={`Ver evento ${data.title}`}>
          <div className="in"><FlyerArt id={data.flyerId} /></div>
        </Link>
        <div className="tkb-i">
          <span className="tkb-k"><span className="tkb-dot" aria-hidden="true" />{kicker}</span>
          <h2 className="tkb-t">{data.title}</h2>
          <ul className="tkb-l">
            <li>
              <span className="tkb-ic" aria-hidden="true"><IcoCalendar /></span>
              <div><b>{data.dateFull}</b>{data.doors && <span className="tkb-sub">{data.doors}</span>}</div>
            </li>
            <li>
              <span className="tkb-ic" aria-hidden="true"><IcoPin /></span>
              <div><b>{data.venue}</b><span className="tkb-sub">{data.addr}</span></div>
            </li>
            <li>
              <span className="tkb-ic" aria-hidden="true"><IcoTicket /></span>
              <div><b>{data.tier}</b><span className="tkb-sub">{data.orderNumber != null ? `Pedido #${data.orderNumber}` : "Ingresso individual"}{data.checkedInLabel && <> · Check-in {data.checkedInLabel}</>}</span></div>
            </li>
            <li>
              <span className="tkb-ic" aria-hidden="true"><IcoUser /></span>
              <div><b>{t.holderName ?? "Titular não informado"}</b><span className="tkb-sub">{movedTo ? `Transferido para ${movedTo}` : `Status: ${TICKET_STATUS_LABEL[status]}`}</span></div>
            </li>
          </ul>
          <div className="tkb-a">
            {valid && data.upcoming && (
              <WalletButtons code={t.code} flags={data.wallet} />
            )}
            {valid && (
              <button className="btn-g" type="button" onClick={() => setTransfer(true)}><IcoArrow />Transferir</button>
            )}
            <Link className="btn-l" href="/meus-ingressos">Voltar</Link>
          </div>
        </div>
        <div className={valid ? "tkb-s" : "tkb-s off"}>
          <button className="qr-b" type="button" onClick={() => setQrOpen(true)} aria-label="Ampliar QR code do ingresso">
            <div className="qr" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
          </button>
          <span className="tkb-code">{t.code}</span>
          <span className="tkb-hold">{holder}</span>
        </div>
      </article>

      <HelpStrip />

      {qrOpen && (
        <Modal label="QR code do ingresso" onClose={() => setQrOpen(false)}>
          <div className="mo-h">
            <div>
              <span className="mo-k">{data.dateNice}</span>
              <b className="mo-t">{data.title}</b>
            </div>
            <button className="pl-x mo-x" type="button" onClick={() => setQrOpen(false)} aria-label="Fechar"><IcoClose /></button>
          </div>
          <div className={valid ? "mo-qr" : "mo-qr off"}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
            <span className="mo-scan" aria-hidden="true" />
          </div>
          <span className="mo-code">{t.code}</span>
          <div className="mo-who">
            <b>{t.holderName ?? "—"}</b>
            <span className="mo-s">{data.tier} · {TICKET_STATUS_LABEL[status]}</span>
          </div>
          <p className="mo-tip"><IcoSun />Aumente o brilho da tela na entrada</p>
        </Modal>
      )}

      {transfer && (
        <TransferModal
          title={data.title}
          ticketId={t.id}
          onClose={() => setTransfer(false)}
          onDone={(email) => { setMovedTo(email); setTransfer(false); flash("Ingresso transferido"); }}
        />
      )}
    </main>
  );
}
