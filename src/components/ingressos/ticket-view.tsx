"use client";

import Link from "next/link";
import { useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { TICKET_STATUS_LABEL } from "@/lib/tickets/labels";
import { HelpStrip } from "./help-strip";
import { IcoArrow, IcoBack, IcoCalendar, IcoChevron, IcoClose, IcoPin, IcoSun, IcoTag, IcoTicket, IcoUser } from "./icons";
import { Modal } from "./modal";
import { TransferModal } from "./transfer-modal";
import { ResaleModal } from "./resale-modal";
import { cancelListing } from "@/lib/actions/revenda";
import { money } from "@/lib/pricing";
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
  /** revenda oficial: liberada pelo produtor, valores e o anúncio atual */
  resale: { enabled: boolean; faceCents: number; maxCents: number; listing: { id: string; priceCents: number; reserved: boolean } | null };
  /** o produtor permite transferir */
  transferEnabled: boolean;
  /** veio do atalho "Revender" da lista: já abre o anúncio */
  openResale?: boolean;
};

export function TicketView({ data }: { data: TicketViewData }) {
  const { flash } = useToast();
  const [transfer, setTransfer] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const [resell, setResell] = useState(!!data.openResale);
  const [listing, setListing] = useState(data.resale.listing);
  const unlist = async () => {
    if (!listing) return;
    const r = await cancelListing(listing.id);
    if (r.ok) { setListing(null); flash("Ingresso retirado da revenda"); } else flash(r.error);
  };
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
      </div>

      <article className="tkb" aria-label={`Ingresso para ${data.title}`}>
        <Link className="tkb-art" href={`/eventos/${data.eventSlug}`} aria-label={`Ver evento ${data.title}`}>
          <div className="in"><FlyerArt id={data.flyerId} /></div>
        </Link>
        <div className="tkb-i">
          <span className="tkb-k"><span className="tkb-dot" aria-hidden="true" />{kicker}</span>
          <h2 className="tkb-t">{data.title}</h2>
          <ul className="tkb-g">
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
              <div><b>{t.holderName ?? "Titular não informado"}</b><span className="tkb-sub">{movedTo ? `Transferido para ${movedTo}` : "Titular do ingresso"}</span></div>
            </li>
          </ul>
          {valid && data.upcoming && (data.wallet.apple || data.wallet.google) && (
            <div className="tkb-w"><WalletButtons code={t.code} flags={data.wallet} pills /></div>
          )}
        </div>
        <div className={valid ? "tkb-s" : "tkb-s off"}>
          <span className={`tk-st sm tk-st-${status}`}>{TICKET_STATUS_LABEL[status]}</span>
          <button className="qr-b" type="button" onClick={() => setQrOpen(true)} aria-label="Ampliar QR code do ingresso">
            <div className="qr" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
          </button>
          <span className="tkb-code">{t.code}</span>
          {!valid && <span className="tkb-hold">{holder}</span>}
        </div>
      </article>

      {/* atalhos: transferir, revender e agenda */}
      <div className="tka">
        {valid && !listing && data.transferEnabled && (
          <button className="tka-i" type="button" onClick={() => setTransfer(true)}>
            <span className="tka-ic" aria-hidden="true"><IcoArrow /></span>
            <span className="tka-t"><b>Transferir</b><small>Envie para um amigo pelo e-mail</small></span>
            <IcoChevron />
          </button>
        )}
        {valid && data.upcoming && data.resale.enabled && (listing ? (
          <div className="tka-i on">
            <span className="tka-ic" aria-hidden="true"><IcoTag /></span>
            <span className="tka-t"><b>À venda por {money(listing.priceCents)}</b><small>{listing.reserved ? "Alguém está pagando agora" : "Vale para você até alguém comprar"}</small></span>
            <button className="tka-x" type="button" onClick={() => void unlist()}>Tirar da revenda</button>
          </div>
        ) : (
          <button className="tka-i" type="button" onClick={() => setResell(true)}>
            <span className="tka-ic" aria-hidden="true"><IcoTag /></span>
            <span className="tka-t"><b>Revender</b><small>Anuncie com segurança na Tickets Win</small></span>
            <IcoChevron />
          </button>
        ))}
        <a className="tka-i" href={`/api/ingressos/${t.code}/ics`} download={`ticketswin-${t.code}.ics`}>
          <span className="tka-ic" aria-hidden="true"><IcoCalendar /></span>
          <span className="tka-t"><b>Adicionar à agenda</b><small>Google, Apple ou Outlook</small></span>
          <IcoChevron />
        </a>
      </div>

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

      {resell && (
        <ResaleModal
          title={data.title}
          ticketId={t.id}
          faceCents={data.resale.faceCents}
          maxCents={data.resale.maxCents}
          onClose={() => setResell(false)}
          onDone={(id, priceCents) => { setResell(false); setListing({ id, priceCents, reserved: false }); flash("Ingresso anunciado na revenda"); }}
        />
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
