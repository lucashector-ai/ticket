"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { abandonPayment } from "@/lib/actions/pagamento";
import { cancelTransfer, resendTransfer } from "@/lib/actions/tickets";
import { money } from "@/lib/pricing";
import { IcoArrow, IcoTicket } from "./icons";
import type { IncomingView, PendingOrderView, SentView } from "./types";

const mmss = (v: number) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
const METHOD: Record<PendingOrderView["method"], string> = { pix: "Pix", card: "Cartão", free: "Grátis" };

/**
 * Pedidos criados e não pagos (dentro da reserva de 15 min): "Pagar agora" volta ao checkout no mesmo pedido.
 * Enquanto há pedido aberto, a página se atualiza sozinha: o pagamento confirmado pelo banco vira ingresso aqui.
 */
export function PendingOrders({ orders }: { orders: PendingOrderView[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [tick, setTick] = useState(0);
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!orders.length) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    // o webhook pode confirmar o pagamento a qualquer momento: confere a cada 20 s com a aba aberta
    const rf = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20_000);
    return () => { clearInterval(iv); clearInterval(rf); };
  }, [orders.length, router]);
  // dados novos do servidor: o cronômetro recomeça da conta dele
  const [seen, setSeen] = useState(orders);
  if (seen !== orders) { setSeen(orders); setTick(0); }

  const cancel = async (id: string) => {
    setBusy(id);
    const r = await abandonPayment(id);
    setBusy(null);
    setAsk(null);
    if (r.ok) { setGone((g) => ({ ...g, [id]: true })); flash("Pedido cancelado. Nada foi cobrado."); router.refresh(); return; }
    if (r.paid) { flash("Este pedido acabou de ser pago."); router.refresh(); return; }
    flash(r.paying ? "O pagamento deste pedido já está sendo confirmado." : "Este pedido não pode mais ser cancelado.");
    router.refresh();
  };

  const list = orders.filter((o) => !gone[o.id]);
  if (!list.length) return null;
  return (
    <section className="mpo-w" aria-labelledby="mpo-h">
      <div className="mi-sec mpo-sec"><h2 id="mpo-h">Aguardando pagamento</h2></div>
      <div className="mpo-l">
        {list.map((o) => {
          const left = Math.max(0, o.secondsLeft - tick);
          const over = left <= 0;
          return (
            <article className={over ? "mpo off" : "mpo"} key={o.id}>
              <div className="mpo-art"><div className="in"><FlyerArt id={o.flyerId} /></div></div>
              <div className="mpo-i">
                <span className="mpo-k"><i aria-hidden="true" />{over ? "Reserva expirada" : "Não pago"} · Pedido #{o.number}</span>
                <b className="mpo-t">{o.title}</b>
                <span className="mpo-d">{[o.dateNice, o.venue].filter(Boolean).join(" · ")}</span>
                <span className="mpo-q">{o.items}</span>
              </div>
              <div className="mpo-s">
                <span className="mpo-v">{o.totalCents ? money(o.totalCents) : "Grátis"}<small>{METHOD[o.method]}</small></span>
                {over
                  ? <span className="mpo-tm low">Os ingressos voltaram para a venda</span>
                  : <span className={left < 120 ? "mpo-tm low" : "mpo-tm"}>Reservado por <b>{mmss(left)}</b></span>}
                {!over && <Link className="mpo-go" href={`/checkout?pedido=${o.id}`}>Pagar agora <IcoArrow /></Link>}
                {!over && (ask === o.id ? (
                  <span className="mpo-ask">
                    <button type="button" className="mpo-x on" onClick={() => void cancel(o.id)} disabled={busy === o.id}>{busy === o.id ? "Cancelando…" : "Confirmar cancelamento"}</button>
                    <button type="button" className="mpo-x" onClick={() => setAsk(null)}>Manter</button>
                  </span>
                ) : (
                  <button type="button" className="mpo-x" onClick={() => setAsk(o.id)}>Cancelar pedido</button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Ingressos que a pessoa mandou para outras (na compra ou por Transferir): aguardando ou recebidos. */
export function SentTickets({ sent }: { sent: SentView[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!sent.length) return null;

  const resend = async (s: SentView) => {
    setBusy(s.id);
    const r = await resendTransfer(s.id);
    setBusy(null);
    flash(r.ok ? `Enviamos de novo para ${s.toEmail}` : r.error);
  };
  const cancel = async (s: SentView) => {
    setBusy(s.id);
    const r = await cancelTransfer(s.ticketId);
    setBusy(null);
    flash(r.ok ? "Envio cancelado. O ingresso voltou para você com um QR code novo." : r.error);
    router.refresh();
  };

  return (
    <>
      <div className="mi-sec"><h2>Ingressos enviados</h2></div>
      <ul className="snt">
        {sent.map((s) => (
          <li className={s.status === "accepted" ? "snt-r ok" : "snt-r"} key={s.id}>
            <span className="snt-av" aria-hidden="true">{((s.holderName ?? s.toEmail).trim()[0] ?? "?").toUpperCase()}</span>
            <span className="snt-i">
              <b>{s.status === "accepted" ? `Recebido por ${s.holderName ?? s.toEmail}` : s.holderName ? `${s.holderName}` : s.toEmail}</b>
              <small>{s.eventTitle} · {s.tier}</small>
              <small className="snt-e">{s.status === "accepted" ? s.toEmail : `Enviado para ${s.toEmail} · aguardando`}</small>
            </span>
            <span className={s.status === "accepted" ? "snt-st ok" : "snt-st"}>{s.status === "accepted" ? "Recebido" : "Aguardando"}</span>
            {s.status === "pending" && (
              <span className="snt-a">
                <button type="button" className="snt-b" onClick={() => void resend(s)} disabled={busy === s.id}>Reenviar</button>
                <button type="button" className="snt-b x" onClick={() => void cancel(s)} disabled={busy === s.id}>Cancelar envio</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="snt-n">Enquanto a pessoa não aceita, o ingresso fica com você e o QR code não vale. Cancelando o envio, ele volta para você com um QR code novo.</p>
    </>
  );
}

/** Ingressos enviados para o e-mail desta conta, esperando a pessoa receber. */
export function IncomingTickets({ items }: { items: IncomingView[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="mi-sec"><h2>Enviados para você</h2></div>
      <div className="tg">
        {items.map((x) => (
          <article className="tm" key={x.token}>
            <div className="tm-art"><div className="in"><FlyerArt id={x.flyerId} /></div></div>
            <div className="tm-i">
              <span className="tm-k">{x.gift ? "Presente · falta receber" : "Transferência · falta aceitar"}</span>
              <b className="tm-t">{x.title}</b>
              <span className="tm-d">{x.dateNice}</span>
              <span className="tm-q">{x.tier}{x.holderName ? ` · ${x.holderName}` : ""}</span>
            </div>
            <div className="tm-s">
              <span className="tm-ic" aria-hidden="true"><IcoTicket /></span>
              <Link className="tm-go" href={`/transferencia/${x.token}`}>{x.gift ? "Receber" : "Aceitar"}</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
