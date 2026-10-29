"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyTicket, requestRefund } from "@/lib/actions/meu-reembolso";
import type { MeuReembolso } from "@/lib/data/meu-reembolso";

const MONEY_BACK = "O valor volta pelo mesmo meio de pagamento: no Pix, para a conta de onde saiu; no cartão, como estorno na fatura. O prazo para aparecer depende do seu banco ou da operadora do cartão.";

/** Ingresso: política de cancelamento, prazos de transferência/revenda, cancelar o ingresso e pedir reembolso. */
export function MeuReembolsoBox({ p }: { p: MeuReembolso }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [out, setOut] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();

  const doCancel = () => start(async () => {
    if (!p.cancel) return;
    const r = await cancelMyTicket(p.code, p.cancel.amountCents);
    if (!r.ok) { setOut({ ok: false, t: r.error }); setConfirm(false); return; }
    setOut({ ok: true, t: r.free ? "Ingresso cancelado e lugar liberado. Obrigado por avisar!" : `Ingresso cancelado. Reembolsamos ${p.cancel.amount}: enviamos os detalhes por e-mail.` });
    setConfirm(false);
    router.refresh();
  });
  const doRequest = () => start(async () => {
    const r = await requestRefund({ code: p.code, message: msg });
    if (!r.ok) { setOut({ ok: false, t: r.error }); return; }
    setOut({ ok: true, t: "Pedido enviado. O produtor responde por e-mail." });
    setAsking(false);
    router.refresh();
  });

  return (
    <section className="mr" aria-labelledby="mr-t">
      <div className="mr-c">
        <h2 className="mr-t" id="mr-t">Cancelamento e reembolso</h2>
        <p className="mr-p">{p.cancelled ? "Este evento foi cancelado pelo produtor. O reembolso é integral (com a taxa de serviço) e automático, para quem comprou." : p.policy}</p>
        <ul className="mr-l">
          {!p.cancelled && <li>{p.rules}</li>}
          {!p.cancelled && p.transfer && <li>{p.transfer}</li>}
          {!p.cancelled && p.resale && <li>{p.resale}</li>}
        </ul>

        {p.cancel && !out?.ok && (
          <div className="mr-box">
            {!confirm ? (
              <>
                <span className="mr-p">{p.cancel.free ? `Não vai poder ir? Libere o seu lugar para outra pessoa (${p.cancel.until}).` : `Você pode cancelar este ingresso ${p.cancel.until}${p.cancel.legal ? ", pelo direito de arrependimento" : ""}.`}</span>
                <div className="mr-a"><button className="mr-b" type="button" onClick={() => setConfirm(true)}>{p.cancel.free ? "Liberar meu lugar" : "Cancelar ingresso"}</button></div>
              </>
            ) : (
              <>
                <b>{p.cancel.free ? "Liberar o seu lugar?" : "Cancelar este ingresso?"}</b>
                {!p.cancel.free && <span className="mr-v">{p.cancel.amount}</span>}
                <span className="mr-p">
                  {p.cancel.free ? "O ingresso deixa de valer e o lugar volta para a venda." : `É o que volta para você${p.cancel.keptFee ? ` (a taxa de serviço de ${p.cancel.keptFee} não é reembolsada neste prazo, pela política do evento)` : ", com a taxa de serviço"}. ${p.cancel.test ? "Pedido de teste: nada foi cobrado de verdade." : MONEY_BACK}`}
                  {" "}O QR code {p.code} deixa de valer na hora. Isso não dá para desfazer.
                </span>
                <div className="mr-a">
                  <button className="mr-b" type="button" disabled={busy} onClick={() => setConfirm(false)}>Voltar</button>
                  <button className="mr-b danger" type="button" disabled={busy} onClick={doCancel}>{busy ? "Cancelando…" : p.cancel.free ? "Liberar lugar" : `Cancelar e receber ${p.cancel.amount}`}</button>
                </div>
              </>
            )}
          </div>
        )}

        {p.request && !out?.ok && (
          <div className="mr-box warn">
            <b>{p.request.reason === "adiamento" ? "O evento foi adiado" : "Reembolso do evento cancelado"}</b>
            <span className="mr-p">
              {p.request.reason === "adiamento"
                ? `Se a nova data não der para você, peça o reembolso do pedido (${p.request.tickets} ${p.request.tickets === 1 ? "ingresso" : "ingressos"}, até ${p.request.total}) até ${p.request.until}.`
                : `O reembolso é automático. Se ele ainda não chegou, avise o produtor por aqui (pedido de até ${p.request.total}).`}
            </span>
            {!asking ? (
              <div className="mr-a"><button className="mr-b dark" type="button" onClick={() => setAsking(true)}>Pedir reembolso</button></div>
            ) : (
              <>
                <label className="mr-f">Mensagem para o produtor (opcional)<textarea maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
                <div className="mr-a">
                  <button className="mr-b" type="button" disabled={busy} onClick={() => setAsking(false)}>Voltar</button>
                  <button className="mr-b dark" type="button" disabled={busy} onClick={doRequest}>{busy ? "Enviando…" : "Enviar pedido"}</button>
                </div>
              </>
            )}
          </div>
        )}
        {p.requested?.status === "pending" && <p className="mr-p"><b>Pedido de reembolso enviado.</b> O produtor responde por e-mail.</p>}
        {p.requested?.status === "rejected" && <p className="mr-p"><b>O produtor não aprovou o seu pedido de reembolso.</b>{p.requested.answer ? ` Resposta: “${p.requested.answer}”` : ""}</p>}
        {p.blocked && !p.cancel && <p className="mr-p">{p.blocked}</p>}
        {out && <p className={out.ok ? "mr-ok" : "mr-err"} role="status">{out.t}</p>}
      </div>
    </section>
  );
}
