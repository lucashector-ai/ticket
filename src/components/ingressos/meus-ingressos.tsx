"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { qtyLabel, TICKET_STATUS_LABEL } from "@/lib/tickets/labels";
import { HelpStrip } from "./help-strip";
import { WalletButtons, type WalletFlags } from "./wallet-buttons";
import { IcoArrow, IcoCalendar, IcoCheck, IcoChevron, IcoClose, IcoNext, IcoPin, IcoPrev, IcoStar, IcoSun, IcoTag, IcoTicket, IcoUser } from "./icons";
import { Modal } from "./modal";
import { TransferModal } from "./transfer-modal";
import type { TicketGroup, TicketItem } from "./types";

type Props = {
  groups: TicketGroup[];
  /** número do pedido confirmado (?pedido=N), se pertencer ao usuário */
  confirmedOrder: number | null;
  wallet: WalletFlags;
};

/** Linha "Titular: …" / status do ingresso dentro do carrossel. */
function holderLabel(t: TicketItem, moved: Record<string, string>) {
  if (moved[t.id]) return `Transferido para ${moved[t.id]}`;
  if (t.status === "transferred") return "Transferido";
  if (t.status === "used") return `Utilizado · ${t.holderName ?? "Titular"}`;
  if (t.status === "cancelled") return "Cancelado";
  if (t.status === "refunded") return "Reembolsado";
  return `Titular: ${t.holderName ?? "—"}`;
}

export function MeusIngressos({ groups, confirmedOrder, wallet }: Props) {
  const { flash } = useToast();
  const [tab, setTab] = useState<"up" | "past">("up");
  const [cur, setCur] = useState<Record<string, number>>({});
  const [qrOf, setQrOf] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ group: TicketGroup; ticket: TicketItem; cur: number } | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState(confirmedOrder != null);

  const up = useMemo(() => groups.filter((g) => g.upcoming).sort((a, b) => a.startAt.localeCompare(b.startAt)), [groups]);
  const past = useMemo(() => groups.filter((g) => !g.upcoming).sort((a, b) => b.startAt.localeCompare(a.startAt)), [groups]);
  const f = up[0];
  const others = up.slice(1);

  const idx = (g: TicketGroup) => Math.min(cur[g.key] ?? 0, g.tickets.length - 1);
  const step = (g: TicketGroup, dir: 1 | -1) => setCur((c) => ({ ...c, [g.key]: ((c[g.key] ?? 0) + dir + g.tickets.length) % g.tickets.length }));


  const onTransferred = (email: string) => {
    if (transfer) setMoved((m) => ({ ...m, [transfer.ticket.id]: email }));
    setTransfer(null);
    flash("Ingresso transferido");
  };

  const rate = (g: TicketGroup, k: number) => {
    setRates((r) => ({ ...r, [g.key]: k }));
    flash(`Avaliação enviada para ${g.title}`);
  };

  const qrGroup = qrOf ? groups.find((g) => g.key === qrOf) ?? null : null;
  const qrTicket = qrGroup ? qrGroup.tickets[idx(qrGroup)] : null;

  return (
    <main className="wrap mi">
      <div className="mi-h">
        <div>
          <h1 className="mi-t">Meus ingressos</h1>
          <p className="mi-s">Apresente o QR code na entrada. Seus ingressos também ficam salvos no app, mesmo sem internet.</p>
        </div>
        <div className="seg" role="tablist" aria-label="Filtrar ingressos">
          <button className={tab === "up" ? "seg-b on" : "seg-b"} type="button" role="tab" aria-selected={tab === "up"} onClick={() => setTab("up")}>
            Próximos <span className="seg-n">{up.length}</span>
          </button>
          <button className={tab === "past" ? "seg-b on" : "seg-b"} type="button" role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>
            Passados <span className="seg-n">{past.length}</span>
          </button>
        </div>
      </div>

      {banner && confirmedOrder != null && (
        <div className="mi-ok" role="status">
          <span className="mi-ok-i" aria-hidden="true"><IcoCheck /></span>
          <span>Pedido <b>#{confirmedOrder}</b> confirmado! Seus ingressos estão aqui.</span>
          <button className="mi-ok-x" type="button" onClick={() => setBanner(false)} aria-label="Fechar aviso"><IcoClose /></button>
        </div>
      )}

      {groups.length === 0 && (
        <div className="empty mi-empty">
          <span className="mi-empty-i" aria-hidden="true"><IcoTicket /></span>
          <h3>Você ainda não tem ingressos</h3>
          <p>Quando comprar, seus QR codes aparecem aqui — e ficam salvos no celular, mesmo sem internet.</p>
          <Link className="btn-p" href="/explorar">Explorar eventos <IcoArrow /></Link>
        </div>
      )}

      {tab === "up" && groups.length > 0 && (
        <>
          {f ? (
            <article className="tkb" aria-label={`Próximo evento: ${f.title}`}>
              <Link className="tkb-art" href={`/eventos/${f.eventSlug}`} aria-label={`Ver evento ${f.title}`}>
                <div className="in"><FlyerArt id={f.flyerId} /></div>
              </Link>
              <div className="tkb-i">
                <span className="tkb-k"><span className="tkb-dot" aria-hidden="true" />Próximo evento · {f.countdown}</span>
                <h2 className="tkb-t">{f.title}</h2>
                {(() => {
                  const t = f.tickets[idx(f)];
                  return (
                    <ul className="tkb-g">
                      <li>
                        <span className="tkb-ic" aria-hidden="true"><IcoCalendar /></span>
                        <div><b>{f.dateFull}</b>{f.doors && <span className="tkb-sub">{f.doors}</span>}</div>
                      </li>
                      <li>
                        <span className="tkb-ic" aria-hidden="true"><IcoPin /></span>
                        <div><b>{f.venue}</b><span className="tkb-sub">{f.addr}</span></div>
                      </li>
                      <li>
                        <span className="tkb-ic" aria-hidden="true"><IcoTicket /></span>
                        <div><b>{f.tier}</b><span className="tkb-sub">{qtyLabel(f.tickets.length)}{f.orderNumber != null && <> · Pedido #{f.orderNumber}</>}</span></div>
                      </li>
                      <li>
                        <span className="tkb-ic" aria-hidden="true"><IcoUser /></span>
                        <div><b>{t.holderName ?? "Titular não informado"}</b><span className="tkb-sub">{moved[t.id] ? `Transferido para ${moved[t.id]}` : "Titular do ingresso"}</span></div>
                      </li>
                    </ul>
                  );
                })()}
                {f.tickets[idx(f)].status === "valid" && !moved[f.tickets[idx(f)].id] && (wallet.apple || wallet.google) && (
                  <div className="tkb-w"><WalletButtons code={f.tickets[idx(f)].code} flags={wallet} pills /></div>
                )}
              </div>
              {(() => {
                const t = f.tickets[idx(f)];
                const off = t.status !== "valid" || !!moved[t.id];
                const st = moved[t.id] ? "transferred" : t.status;
                return (
                  <div className={off ? "tkb-s off" : "tkb-s"}>
                    <span className={`tk-st sm tk-st-${st}`}>{TICKET_STATUS_LABEL[st]}</span>
                    <button className="qr-b" type="button" onClick={() => setQrOf(f.key)} aria-label={`Ampliar QR code do ingresso ${idx(f) + 1} de ${f.tickets.length}`}>
                      <div className="qr" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
                    </button>
                    <span className="tkb-code">{t.code}</span>
                    {f.tickets.length > 1 && (
                      <div className="tkb-pg">
                        <button className="pg-b" type="button" onClick={() => step(f, -1)} aria-label="Ingresso anterior"><IcoPrev /></button>
                        <span className="pg-t">Ingresso {idx(f) + 1} de {f.tickets.length}</span>
                        <button className="pg-b" type="button" onClick={() => step(f, 1)} aria-label="Próximo ingresso"><IcoNext /></button>
                      </div>
                    )}
                    {off && <span className="tkb-hold">{holderLabel(t, moved)}</span>}
                  </div>
                );
              })()}
            </article>
          ) : null}
          {f && (() => {
            const t = f.tickets[idx(f)];
            const can = t.status === "valid" && !moved[t.id];
            return (
              <div className="tka">
                {can && (
                  <button className="tka-i" type="button" onClick={() => setTransfer({ group: f, ticket: t, cur: idx(f) + 1 })}>
                    <span className="tka-ic" aria-hidden="true"><IcoArrow /></span>
                    <span className="tka-t"><b>Transferir</b><small>Envie para um amigo pelo e-mail</small></span>
                    <IcoChevron />
                  </button>
                )}
                {can && f.resale && (
                  <Link className="tka-i" href={`/ingressos/${t.code}?revender=1`}>
                    <span className="tka-ic" aria-hidden="true"><IcoTag /></span>
                    <span className="tka-t"><b>Revender</b><small>Anuncie com segurança na Tickets Win</small></span>
                    <IcoChevron />
                  </Link>
                )}
                <a className="tka-i" href={`/api/ingressos/${t.code}/ics`} download={`ticketswin-${t.code}.ics`}>
                  <span className="tka-ic" aria-hidden="true"><IcoCalendar /></span>
                  <span className="tka-t"><b>Adicionar à agenda</b><small>Google, Apple ou Outlook</small></span>
                  <IcoChevron />
                </a>
              </div>
            );
          })()}
          {!f && (
            <div className="empty mi-empty">
              <h3>Nenhum evento por vir</h3>
              <p>Seus próximos ingressos aparecem aqui assim que você comprar.</p>
              <Link className="btn-p" href="/explorar">Explorar eventos <IcoArrow /></Link>
            </div>
          )}

          {others.length > 0 && (
            <>
              <div className="mi-sec"><h2>Também na sua agenda</h2></div>
              <div className="tg">
                {others.map((g) => {
                  const t = g.tickets[idx(g)];
                  return (
                    <article className="tm" key={g.key}>
                      <div className="tm-art"><div className="in"><FlyerArt id={g.flyerId} /></div></div>
                      <div className="tm-i">
                        <span className="tm-k">{g.countdown}</span>
                        <b className="tm-t">{g.title}</b>
                        <span className="tm-d">{g.dateNice}</span>
                        <span className="tm-d">{g.venue}{g.city && <> · {g.city}</>}</span>
                        <span className="tm-q">{qtyLabel(g.tickets.length)} · {g.tier}</span>
                      </div>
                      <div className="tm-s">
                        <button className="tm-qr" type="button" onClick={() => setQrOf(g.key)} aria-label={`Ver QR code de ${g.title}`}>
                          <div className="qr" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
                        </button>
                        <Link className="tm-go" href={`/ingressos/${g.tickets[0].code}`}>Ver ingresso</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === "past" && groups.length > 0 && (
        past.length > 0 ? (
          <div className="tg past">
            {past.map((g) => {
              const r = rates[g.key] ?? 0;
              const used = g.tickets.some((t) => t.status === "used");
              return (
                <article className="tm" key={g.key}>
                  <div className="tm-art"><div className="in"><FlyerArt id={g.flyerId} /></div></div>
                  <div className="tm-i">
                    <span className="tm-k done">Encerrado</span>
                    <b className="tm-t">{g.title}</b>
                    <span className="tm-d">{g.datePast}</span>
                    <span className="tm-d">{g.venue}{g.city && <> · {g.city}</>}</span>
                    <span className="tm-q">{qtyLabel(g.tickets.length)} · {used ? "Ingresso utilizado" : "Evento encerrado"}</span>
                  </div>
                  <div className="tm-s">
                    <div className="stars" role="group" aria-label={`Avaliar ${g.title}`}>
                      {[1, 2, 3, 4, 5].map((k) => (
                        <button key={k} className={k <= r ? "st on" : "st"} type="button" onClick={() => rate(g, k)} aria-label={`${k} ${k === 1 ? "estrela" : "estrelas"}`} aria-pressed={k <= r}>
                          <IcoStar />
                        </button>
                      ))}
                    </div>
                    <span className="tm-rt">{r ? "Obrigado pela avaliação!" : "Como foi o evento?"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty mi-empty">
            <h3>Nenhum evento passado</h3>
            <p>Os eventos que você já curtiu ficam guardados aqui, com espaço para avaliar.</p>
          </div>
        )
      )}

      <HelpStrip />

      {qrGroup && qrTicket && (
        <Modal label="QR code do ingresso" onClose={() => setQrOf(null)}>
          <div className="mo-h">
            <div>
              <span className="mo-k">{qrGroup.dateNice}</span>
              <b className="mo-t">{qrGroup.title}</b>
            </div>
            <button className="pl-x mo-x" type="button" onClick={() => setQrOf(null)} aria-label="Fechar"><IcoClose /></button>
          </div>
          <div className={qrTicket.status !== "valid" || moved[qrTicket.id] ? "mo-qr off" : "mo-qr"}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qrTicket.qrSvg }} />
            <span className="mo-scan" aria-hidden="true" />
          </div>
          <span className="mo-code">{qrTicket.code}</span>
          <div className="mo-who">
            <b>{holderLabel(qrTicket, moved).replace("Titular: ", "")}</b>
            <span className="mo-s">{qrGroup.tier} · Ingresso {idx(qrGroup) + 1} de {qrGroup.tickets.length}</span>
          </div>
          {qrGroup.tickets.length > 1 && (
            <div className="tkb-pg mo-pg">
              <button className="pg-b" type="button" onClick={() => step(qrGroup, -1)} aria-label="Ingresso anterior"><IcoPrev /></button>
              <span className="pg-dots">{qrGroup.tickets.map((t, i) => <i key={t.id} className={i === idx(qrGroup) ? "on" : ""} />)}</span>
              <button className="pg-b" type="button" onClick={() => step(qrGroup, 1)} aria-label="Próximo ingresso"><IcoNext /></button>
            </div>
          )}
          <p className="mo-tip"><IcoSun />Aumente o brilho da tela na entrada</p>
        </Modal>
      )}

      {transfer && (
        <TransferModal
          title={transfer.group.title}
          ticketId={transfer.ticket.id}
          cur={transfer.cur}
          qty={transfer.group.tickets.length}
          onClose={() => setTransfer(null)}
          onDone={onTransferred}
        />
      )}
    </main>
  );
}
