"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { cancelMyTickets, previewMyCancel, requestRefund } from "@/lib/actions/meu-reembolso";
import { abandonPayment } from "@/lib/actions/pagamento";
import { cancelTransfer, resendTransfer } from "@/lib/actions/tickets";
import type { CancelView } from "@/lib/data/pedido";
import { brl } from "@/lib/format";

const MONEY_BACK = "O valor volta pelo mesmo meio de pagamento: no Pix, para a conta de onde saiu; no cartão, como estorno na fatura. O prazo para aparecer depende do seu banco ou da operadora do cartão.";

/** Cancelar a compra inteira ou os ingressos escolhidos, e pedir reembolso quando o evento foi adiado. */
export function PedidoCancel({ orderId, number, c }: { orderId: string; number: number; c: CancelView }) {
  const router = useRouter();
  const can = c.can;
  const [step, setStep] = useState<"idle" | "choose" | "confirm">("idle");
  const [sel, setSel] = useState<string[]>(can?.tickets.map((t) => t.code) ?? []);
  const [quote, setQuote] = useState<{ cents: number; kept: number } | null>(can ? { cents: can.allCents, kept: can.allKeptFeeCents } : null);
  const [quoting, setQuoting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [out, setOut] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();

  const all = !!can && sel.length === can.tickets.length;
  const many = !!can && can.tickets.length > 1;
  const wholeLabel = can?.full ? "Cancelar compra" : many ? "Cancelar todos os ingressos" : "Cancelar ingresso";

  const toggle = async (code: string) => {
    if (!can) return;
    const next = sel.includes(code) ? sel.filter((x) => x !== code) : [...sel, code];
    setSel(next);
    setOut(null);
    if (!next.length) { setQuote(null); return; }
    if (next.length === can.tickets.length) { setQuote({ cents: can.allCents, kept: can.allKeptFeeCents }); return; }
    setQuoting(true);
    const r = await previewMyCancel({ orderId, codes: next });
    setQuoting(false);
    if (r.ok) setQuote({ cents: r.amountCents, kept: r.keptFeeCents });
    else { setQuote(null); setOut({ ok: false, t: r.error }); }
  };

  const doCancel = () => start(async () => {
    if (!can || !quote || !sel.length) return;
    const r = await cancelMyTickets({ orderId, codes: sel, expectCents: quote.cents });
    if (!r.ok) { setOut({ ok: false, t: r.error }); setStep("idle"); return; }
    const what = r.tickets === 1 ? "Ingresso cancelado" : `${r.tickets} ingressos cancelados`;
    setOut({ ok: true, t: r.free ? `${what}. Os lugares voltaram para a venda.` : `${what}. Reembolsamos ${brl(r.amountCents)}${can.test ? " (pedido de teste: nada foi cobrado de verdade)" : ""} e enviamos os detalhes por e-mail.` });
    setStep("idle");
    router.refresh();
  });

  const doRequest = () => start(async () => {
    if (!c.request) return;
    const r = await requestRefund({ code: c.request.code, message: msg });
    if (!r.ok) { setOut({ ok: false, t: r.error }); return; }
    setOut({ ok: true, t: "Pedido de reembolso enviado. O produtor responde por e-mail." });
    setAsking(false);
    router.refresh();
  });

  const feeNote = (kept: number) => kept > 0
    ? `A taxa de serviço de ${brl(kept)} não é reembolsada: o cancelamento está fora dos 7 dias do direito de arrependimento.`
    : "Reembolso integral, com a taxa de serviço.";
  const help = `/contato?pedido=${number}&assunto=reembolso`;

  return (
    <section className="ct-card od-sec" aria-labelledby="od-cancel-t">
      <h2 className="ct-h" id="od-cancel-t">Cancelamento e reembolso</h2>
      <p className="ct-v">{c.eventCancelled ? "Este evento foi cancelado pelo produtor. O reembolso é integral (com a taxa de serviço) e automático para quem comprou." : c.policy}</p>
      {!c.eventCancelled && <p className="ct-note">{c.rules}</p>}

      {can && !out?.ok && (
        <div className="od-box">
          {step === "idle" && (
            <>
              <div className="od-box-r">
                <span className="od-box-t">
                  <b>{can.free ? "Não vai mais? Libere os lugares." : `Se cancelar agora, ${brl(can.allCents)} volta para você`}</b>
                  <small>{can.free ? `Você pode cancelar ${can.until}.` : `Você pode cancelar ${can.until}${can.legal ? ", pelo direito de arrependimento" : ""}. ${feeNote(can.allKeptFeeCents)}`}</small>
                </span>
              </div>
              {c.others && <p className="ct-note">{c.others}</p>}
              <div className="od-box-a">
                {many && <button type="button" className="ct-b ghost" onClick={() => { setStep("choose"); setOut(null); }}>Cancelar ingressos</button>}
                <button type="button" className="ct-b danger" onClick={() => { setSel(can.tickets.map((t) => t.code)); setQuote({ cents: can.allCents, kept: can.allKeptFeeCents }); setStep("confirm"); setOut(null); }}>{wholeLabel}</button>
              </div>
            </>
          )}

          {step === "choose" && (
            <fieldset className="od-pick">
              <legend>Quais ingressos você quer cancelar?</legend>
              {can.tickets.map((t) => (
                <label key={t.code} className="ct-check od-pick-i">
                  <input type="checkbox" checked={sel.includes(t.code)} onChange={() => void toggle(t.code)} disabled={busy} />
                  <span><b>{t.code}</b><small>{t.label}</small></span>
                </label>
              ))}
              <p className="od-quote" aria-live="polite">
                {!sel.length ? "Escolha pelo menos um ingresso." : quoting ? "Calculando…" : quote ? <>Volta para você: <b>{can.free ? "sem cobrança" : brl(quote.cents)}</b>{!can.free && quote.kept > 0 ? ` (taxa de ${brl(quote.kept)} não reembolsada)` : ""}</> : null}
              </p>
              <div className="od-box-a">
                <button type="button" className="ct-b ghost" onClick={() => setStep("idle")}>Voltar</button>
                <button type="button" className="ct-b danger" disabled={!sel.length || quoting || !quote} onClick={() => setStep("confirm")}>Continuar</button>
              </div>
            </fieldset>
          )}

          {step === "confirm" && quote && (
            <div className="od-conf" role="group" aria-labelledby="od-conf-t">
              <b id="od-conf-t">{all && can.full ? "Cancelar a compra inteira?" : sel.length === 1 ? "Cancelar este ingresso?" : `Cancelar ${sel.length} ingressos?`}</b>
              {!can.free && <span className="od-conf-v">{brl(quote.cents)}</span>}
              <p className="ct-note">
                {can.free ? "Os ingressos deixam de valer e os lugares voltam para a venda." : `É o que volta para você. ${feeNote(quote.kept)} ${can.test ? "Pedido de teste: nada foi cobrado de verdade." : MONEY_BACK}`}
                {" "}{sel.length === 1 ? `O QR code ${sel[0]} deixa` : `Os QR codes ${sel.join(", ")} deixam`} de valer na hora. Isso não dá para desfazer.
              </p>
              <div className="od-box-a">
                <button type="button" className="ct-b ghost" disabled={busy} onClick={() => setStep(many && !all ? "choose" : "idle")}>Voltar</button>
                <button type="button" className="ct-b danger" disabled={busy} onClick={doCancel}>{busy ? "Cancelando…" : can.free ? "Confirmar cancelamento" : `Cancelar e receber ${brl(quote.cents)}`}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {c.request && !out?.ok && (
        <div className="od-box warn">
          <span className="od-box-t">
            <b>{c.request.reason === "adiamento" ? "O evento foi adiado" : "Reembolso do evento cancelado"}</b>
            <small>
              {c.request.reason === "adiamento"
                ? `Se a nova data não der para você, peça o reembolso do pedido (${c.request.tickets} ${c.request.tickets === 1 ? "ingresso" : "ingressos"}, até ${c.request.total}) até ${c.request.until}.`
                : `O reembolso é automático. Se ele ainda não chegou, avise o produtor por aqui (pedido de até ${c.request.total}).`}
            </small>
          </span>
          {!asking ? (
            <div className="od-box-a"><button type="button" className="ct-b dark" onClick={() => setAsking(true)}>Pedir reembolso</button></div>
          ) : (
            <>
              <label className="ct-f"><span className="ct-l">Mensagem para o produtor <em>(opcional)</em></span><textarea className="ct-in od-ta" maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
              <div className="od-box-a">
                <button type="button" className="ct-b ghost" disabled={busy} onClick={() => setAsking(false)}>Voltar</button>
                <button type="button" className="ct-b dark" disabled={busy} onClick={doRequest}>{busy ? "Enviando…" : "Enviar pedido"}</button>
              </div>
            </>
          )}
        </div>
      )}

      {c.requested?.status === "pending" && <p className="ct-v"><b>Pedido de reembolso enviado.</b> O produtor responde por e-mail.</p>}
      {c.requested?.status === "rejected" && <p className="ct-v"><b>O produtor não aprovou o seu pedido de reembolso.</b>{c.requested.answer ? ` Resposta: “${c.requested.answer}”` : ""}</p>}

      {!can && !c.request && c.blocked && (
        <div className="od-box muted">
          <span className="od-box-t"><b>Não dá para cancelar pelo site</b><small>{c.blocked}</small></span>
          <div className="od-box-a"><Link className="ct-b ghost" href={help}>Falar com a Tickets Win</Link></div>
        </div>
      )}
      {out && <p className={out.ok ? "od-ok" : "ct-err"} role="status">{out.t}</p>}
    </section>
  );
}

/** Envio para outra pessoa ainda não aceito: reenviar o e-mail ou cancelar (as mesmas ações de Meus ingressos). */
export function DeliveryActions({ transferId, ticketId, email }: { transferId: string; ticketId: string; email: string }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const resend = async () => {
    setBusy(true);
    const r = await resendTransfer(transferId);
    setBusy(false);
    flash(r.ok ? `Enviamos de novo para ${email}` : r.error);
  };
  const cancel = async () => {
    setBusy(true);
    const r = await cancelTransfer(ticketId);
    setBusy(false);
    setAsk(false);
    flash(r.ok ? "Envio cancelado. O ingresso voltou para você com um QR code novo." : r.error);
    router.refresh();
  };
  return ask ? (
    <>
      <button type="button" className="ct-b sm danger" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelando…" : "Confirmar"}</button>
      <button type="button" className="ct-b sm ghost" disabled={busy} onClick={() => setAsk(false)}>Manter</button>
    </>
  ) : (
    <>
      <button type="button" className="ct-b sm ghost" disabled={busy} onClick={() => void resend()}>Reenviar</button>
      <button type="button" className="ct-b sm ghost" disabled={busy} onClick={() => setAsk(true)} aria-label={`Cancelar envio para ${email}`}>Cancelar envio</button>
    </>
  );
}

/** Pedido aberto e não pago: voltar ao checkout no mesmo pedido ou desistir dele (nada é cobrado). */
export function PendingActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { flash } = useToast();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    const r = await abandonPayment(orderId);
    setBusy(false);
    setAsk(false);
    flash(r.ok ? "Pedido cancelado. Nada foi cobrado." : r.paid ? "Este pedido acabou de ser pago." : r.paying ? "O pagamento deste pedido já está sendo confirmado." : "Este pedido não pode mais ser cancelado.");
    router.refresh();
  };
  return (
    <div className="od-box-a">
      {ask ? (
        <>
          <button type="button" className="ct-b ghost" disabled={busy} onClick={() => setAsk(false)}>Manter pedido</button>
          <button type="button" className="ct-b danger" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelando…" : "Confirmar cancelamento"}</button>
        </>
      ) : (
        <>
          <button type="button" className="ct-b ghost" onClick={() => setAsk(true)}>Cancelar pedido</button>
          <Link className="ct-b dark" href={`/checkout?pedido=${orderId}`}>Pagar agora</Link>
        </>
      )}
    </div>
  );
}

export function PrintButton({ className = "ct-b dark", label = "Imprimir ou salvar PDF" }: { className?: string; label?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}
