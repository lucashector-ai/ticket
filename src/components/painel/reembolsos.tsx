"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { brl } from "@/lib/format";
import {
  cancelEventAction, cancelStep, decideRefundRequest, loadRefundOrder, postponeEventAction, previewOrderRefund, refundOrderAction,
  saveCancelPolicy, searchRefundOrders, type RefundPreview,
} from "@/lib/actions/reembolsos";
import type { HistoryRow, OrderStatusKey, RefundOrderDetail, RefundOrderRow, RefundTab, RequestRow } from "@/lib/data/reembolsos";
import type { CancelProgress } from "@/lib/payments/cancel-event";
import { hoursLabel, LEGAL_DAYS, LEGAL_MIN_HOURS, POLICY_HOURS, policyText, POSTPONE_REFUND_DAYS, type CancelPolicy } from "@/lib/refund-policy";
import { PainelPortal } from "./emails/portal";
import { Tbl } from "@/components/painel/tbl";

const ORDER_ST: Record<OrderStatusKey, [string, string]> = {
  paid: ["Pago", "st on"], partial: ["Reembolso parcial", "st warn"], refunded: ["Reembolsado", "st end"], cancelled: ["Cancelado", "st end"], pending: ["Pendente", "st draft"], expired: ["Expirado", "st end"],
};
const TICKET_ST: Record<string, [string, string]> = {
  valid: ["Válido", "st on"], used: ["Entrou", "st warn"], transferred: ["Em envio", "st draft"], refunded: ["Reembolsado", "st end"], cancelled: ["Cancelado", "st end"],
};
const ROW_ST: Record<HistoryRow["status"], [string, string]> = { succeeded: ["Concluído", "st on"], pending: ["Em andamento", "st warn"], failed: ["Falhou", "st off"] };
const REFUNDABLE = new Set(["valid", "used", "transferred"]);
const MONEY_BACK = "Volta pelo mesmo meio de pagamento (Pix para a conta de origem, cartão como estorno na fatura). O prazo para aparecer depende do banco ou do cartão.";

/** Aba "Cancelamentos e reembolsos": reembolsar pedidos, pedidos dos compradores, política, adiar e cancelar o evento. */
export function PainelReembolsos({ p }: { p: RefundTab }) {
  const [open, setOpen] = useState<{ orderId: string; request?: RequestRow } | null>(null);
  const k = p.kpis;
  const kpis: [string, string, string][] = [
    ["Reembolsado", k.refunded, "devolvido aos compradores (sem testes)"],
    ["Pedidos reembolsados", String(k.orders), "total ou em parte"],
    ["Saiu do seu saldo", k.producer, "no Banco Tickets Win"],
    ["Pedidos de reembolso", String(k.pending), k.pending ? "esperando sua resposta" : "nenhum em aberto"],
  ];
  return (
    <div className="lnc rr">
      {p.cancelled && <CancelStatus p={p} onOpen={(orderId) => setOpen({ orderId })} />}
      {!p.cancelled && p.postponed && (
        <div className="rr-ban">
          <b>Evento adiado em {p.postponed.at}.</b>
          <span>A data anterior era {p.postponed.from}; agora é {p.startLabel}. {p.postponed.open ? `Os compradores podem pedir reembolso até ${p.postponed.until}.` : `O prazo para pedir reembolso acabou em ${p.postponed.until}.`}</span>
        </div>
      )}
      <div className="kpis">
        {kpis.map(([l, v, s]) => <div className="kpi" key={l}><span className="kp-l">{l}</span><b className="kp-v">{v}</b><div className="kp-f"><span className="kp-n">{s}</span></div></div>)}
      </div>
      <div className="cols">
        <div className="maincol">
          <Orders p={p} onOpen={(orderId) => setOpen({ orderId })} />
          {(p.requests.length > 0 || p.postponed?.open) && <Requests p={p} onOpen={(r) => setOpen({ orderId: r.orderId, request: r })} />}
          <History rows={p.history} onOpen={(orderId) => setOpen({ orderId })} />
        </div>
        <aside className="side2">
          <section className="cx rr-rules">
            <div className="card-h"><h2 className="card-t">Como funciona</h2></div>
            <ul className="rv-how">
              <li>O comprador recebe de volta o valor pago pelos ingressos, <b>com a taxa de serviço</b>, dividido por ingresso.</li>
              <li>Do seu saldo sai só o líquido que você recebeu por eles. A taxa é devolvida pela Tickets Win.</li>
              <li>Se você já sacou, o saldo fica negativo e é descontado das próximas vendas.</li>
              <li>Pix e cartão voltam para o meio de pagamento original. O prazo depende do banco ou do cartão.</li>
              <li>Pedidos de teste são só marcados como reembolsados: nenhum dinheiro é movimentado.</li>
            </ul>
          </section>
          {!p.cancelled && <Policy p={p} />}
          {!p.cancelled && !p.started && p.status === "published" && <Postpone p={p} />}
          {!p.cancelled && <CancelEvent p={p} />}
        </aside>
      </div>
      {open && <OrderDialog eventId={p.eventId} orderId={open.orderId} request={open.request} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------- busca de pedidos ---------------- */

function Orders({ p, onOpen }: { p: RefundTab; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<RefundOrderRow[]>(p.recent);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    // a primeira lista já vem do servidor
    if (first.current) { first.current = false; if (!q) return; }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchRefundOrders(p.eventId, q);
      if (my !== seq.current) return;
      setLoading(false);
      if (r.ok) setRows(r.rows);
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, p.eventId, p.recent]);
  return (
    <section className="cx">
      <div className="card-h wrap2">
        <div><h2 className="card-t">Reembolsar ou cancelar ingressos</h2><span className="card-s">Ache o pedido, veja os detalhes e reembolse o pedido inteiro ou só alguns ingressos.</span></div>
      </div>
      <label className="pd-search in-card rr-q">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
        <input autoComplete="off" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail, nº do pedido ou código do ingresso" aria-label="Buscar pedido" />
      </label>
      <Tbl label="Pedidos para reembolsar ou cancelar" aria-busy={loading}>
        <div className="rr-or thd"><span>Pedido</span><span>Comprador</span><span>Pago</span><span>Situação</span><span /></div>
        {rows.map((o) => (
          <button className="rr-or" key={o.id} type="button" onClick={() => onOpen(o.id)}>
            <span className="rr-n">nº {o.number ?? "—"}<small>{o.at}</small></span>
            <span className="rr-b"><b>{o.buyer}</b><small>{o.email}</small></span>
            <span className="rr-v">{o.total}<small>{o.qty} {o.qty === 1 ? "ingresso" : "ingressos"} · {o.method}</small></span>
            <span className={ORDER_ST[o.status][1]}>{ORDER_ST[o.status][0]}</span>
            <span className="rr-go" aria-hidden="true">›</span>
          </button>
        ))}
        {!rows.length && <div className="empty2"><b className="em-t">{q ? "Nenhum pedido encontrado" : "Nenhum pedido pago ainda"}</b><span className="em-s">{q ? "Tente o e-mail completo, o número do pedido (ex.: 48213) ou o código do ingresso (TW-…)." : "Os pedidos pagos aparecem aqui."}</span></div>}
      </Tbl>
      {!q && rows.length >= 25 && <span className="tbl-f">Mostrando os 25 mais recentes. Use a busca para achar os outros.</span>}
    </section>
  );
}

/* ---------------- detalhe do pedido + confirmação ---------------- */

function OrderDialog({ eventId, orderId, request, onClose }: { eventId: string; orderId: string; request?: RequestRow; onClose: () => void }) {
  const router = useRouter();
  const { flash } = useToast();
  const [o, setO] = useState<RefundOrderDetail | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [step, setStep] = useState<{ mode: "all" | "sel"; p: RefundPreview } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [okCheckedIn, setOkCheckedIn] = useState(false);
  const [busy, start] = useTransition();

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    loadRefundOrder(eventId, orderId).then((r) => {
      if (!live) return;
      if (!r.ok) { setErr(r.error); return; }
      setO(r.order); setSel(new Set());
    });
    return () => { live = false; };
  }, [eventId, orderId, version]);
  const load = () => setVersion((v) => v + 1);

  const ask = (mode: "all" | "sel") => start(async () => {
    const r = await previewOrderRefund(eventId, orderId, mode === "all" ? "all" : [...sel]);
    if (!r.ok) { flash(r.error); return; }
    setOkCheckedIn(false);
    setStep({ mode, p: r.p });
  });
  const confirm = () => start(async () => {
    if (!step) return;
    const r = request && step.mode === "all"
      ? await decideRefundRequest({ eventId, requestId: request.id, approve: true, answer: note, allowCheckedIn: okCheckedIn })
      : await refundOrderAction({ eventId, orderId, sel: step.mode === "all" ? "all" : [...sel], note, allowCheckedIn: okCheckedIn });
    if (!r.ok) {
      flash(r.error);
      // falha na Stripe: volta para o pedido, que mostra a tentativa no histórico
      if ("code" in r && r.code !== "checked_in" && r.code !== "busy") { setStep(null); load(); router.refresh(); }
      return;
    }
    flash(step.p.free ? "Ingressos cancelados. O comprador foi avisado por e-mail." : step.p.test ? `Reembolso de teste registrado (${brl(step.p.amountCents)}).` : `Reembolso de ${brl(step.p.amountCents)} solicitado. O comprador foi avisado por e-mail.`);
    setStep(null); setNote("");
    router.refresh();
    if (request) onClose(); else load();
  });
  const reject = () => start(async () => {
    if (!request) return;
    const r = await decideRefundRequest({ eventId, requestId: request.id, approve: false, answer: note });
    if (!r.ok) { flash(r.error); return; }
    flash("Pedido recusado. O comprador foi avisado por e-mail.");
    router.refresh(); onClose();
  });

  const refundable = o?.tickets.filter((t) => REFUNDABLE.has(t.status)) ?? [];
  const selTotal = o ? o.tickets.filter((t) => sel.has(t.id)).reduce((s, t) => s + (t.share ?? 0), 0) : 0;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const verb = o?.free ? "Cancelar" : "Reembolsar";

  return (
    <PainelPortal>
      <div className="ml-ov" role="dialog" aria-modal="true" aria-label={o ? `Pedido nº ${o.number}` : "Pedido"} onClick={() => !busy && onClose()}>
        <div className="ml-dlg rr-dlg" onClick={(e) => e.stopPropagation()}>
          {!o ? (
            <div className="rr-load">{err || "Carregando o pedido…"}{err && <button className="b2" type="button" onClick={onClose}>Fechar</button>}</div>
          ) : step ? (
            <ConfirmStep o={o} step={step} note={note} busy={busy} okCheckedIn={okCheckedIn} setOkCheckedIn={setOkCheckedIn} onBack={() => setStep(null)} onConfirm={confirm} />
          ) : (
            <>
              <div className="rr-dh">
                <div><span className="sec-k">Pedido nº {o.number ?? "—"} · {o.at}</span><h2 className="card-t">{o.buyer}</h2><span className="card-s">{[o.email, o.phone].filter(Boolean).join(" · ")}</span></div>
                <span className={ORDER_ST[o.status][1]}>{ORDER_ST[o.status][0]}</span>
                <button className="b2 icon rr-x" type="button" onClick={onClose} aria-label="Fechar">✕</button>
              </div>
              {request && (
                <div className="rr-req">
                  <b>Pedido de reembolso do comprador · {request.reason}</b>
                  {request.message && <span>“{request.message}”</span>}
                  {request.inWindow && <small>Pedido feito dentro de {POSTPONE_REFUND_DAYS} dias do adiamento: pelos Termos, o comprador tem direito ao reembolso integral.</small>}
                </div>
              )}
              <div className="rr-money">
                <span>Pagamento</span><b>{o.method}</b>
                <span>Ingressos</span><b>{brl(o.money.subtotal)}</b>
                {o.money.meia > 0 && <><span>Meia-entrada</span><b>−{brl(o.money.meia)}</b></>}
                {o.money.discount > 0 && <><span>Cupom</span><b>−{brl(o.money.discount)}</b></>}
                <span>Taxa de serviço</span><b>{o.absorbFee ? "inclusa (absorvida por você)" : brl(o.money.fee)}</b>
                {o.money.interest > 0 && <><span>Juros do parcelamento</span><b>{brl(o.money.interest)}</b></>}
                <span className="rr-strong">Total pago</span><b className="rr-strong">{o.free ? "Grátis" : brl(o.money.total)}</b>
                {o.money.refunded > 0 && <><span>Já reembolsado</span><b>−{brl(o.money.refunded)}</b></>}
                {!o.free && <><span>Seu líquido neste pedido</span><b>{o.resale ? "compra na revenda" : brl(o.money.net)}</b></>}
              </div>
              {o.test && <p className="rr-note">Pedido de teste (sem cobrança): o reembolso só é registrado, nenhum dinheiro é movimentado e o saldo não muda.</p>}
              {o.resale && <p className="rr-note">Ingresso comprado na revenda oficial: o comprador recebe o que pagou na revenda; do seu saldo sai o valor original do ingresso.</p>}
              <div className="rr-tk">
                {o.tickets.map((t) => {
                  const can = REFUNDABLE.has(t.status);
                  return (
                    <label className={can ? "rr-t" : "rr-t off"} key={t.id}>
                      <input type="checkbox" disabled={!can || busy} checked={sel.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Escolher ${t.code}`} />
                      <span className="rr-ti"><b>{t.type}{t.meia ? " · meia" : ""}</b><small>{t.code} · {t.holder || "Sem nome"}{t.gifted ? " (recebeu de quem comprou)" : ""}</small></span>
                      <span className="rr-tv">{can && t.share !== null ? (o.free ? "Grátis" : brl(t.share)) : ""}</span>
                      <span className={TICKET_ST[t.status]?.[1] ?? "st end"}>{t.inAt ? `Entrou ${t.inAt}` : TICKET_ST[t.status]?.[0] ?? t.status}</span>
                    </label>
                  );
                })}
                {!o.tickets.length && <span className="card-s">Este pedido não tem ingressos emitidos.</span>}
              </div>
              {(refundable.length > 0 || request) && (
                <label className="fld">
                  <span>{request ? "Resposta para o comprador (opcional)" : "Recado para o comprador (opcional, vai no e-mail)"}</span>
                  <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={request ? "Ex.: Reembolso aprovado. Esperamos você numa próxima!" : "Ex.: Cancelamos a pedido do comprador pelo WhatsApp."} />
                </label>
              )}
              <div className="dl-a rr-act">
                {request && !rejecting && <button className="b2" type="button" disabled={busy} onClick={() => setRejecting(true)}>Recusar pedido</button>}
                {request && rejecting && <button className="b2 danger" type="button" disabled={busy} onClick={reject}>{busy ? "Enviando…" : "Confirmar recusa"}</button>}
                {refundable.length > 0 && !request && <button className="b2" type="button" disabled={!sel.size || busy} onClick={() => ask("sel")}>{verb} selecionados{sel.size ? ` (${sel.size}${o.free ? "" : ` · ${brl(selTotal)}`})` : ""}</button>}
                {refundable.length > 0 && <button className="b2 dark" type="button" disabled={busy} onClick={() => ask("all")}>{request ? "Aprovar e reembolsar" : o.free ? "Cancelar todos os ingressos" : "Reembolsar pedido inteiro"}</button>}
                {!refundable.length && <span className="card-s">Nada mais a reembolsar neste pedido.</span>}
              </div>
              {o.refunds.length > 0 && (
                <div className="rr-hist">
                  <span className="sec-k">Histórico deste pedido</span>
                  {o.refunds.map((h) => <HistoryLine key={h.id} h={h} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PainelPortal>
  );
}

function ConfirmStep({ o, step, note, busy, okCheckedIn, setOkCheckedIn, onBack, onConfirm }: {
  o: RefundOrderDetail; step: { mode: "all" | "sel"; p: RefundPreview }; note: string; busy: boolean; okCheckedIn: boolean; setOkCheckedIn: (v: boolean) => void; onBack: () => void; onConfirm: () => void;
}) {
  const p = step.p;
  const blocked = p.checkedIn > 0 && !okCheckedIn;
  return (
    <div className="rr-conf">
      <span className="dl-ic warn" aria-hidden="true">!</span>
      <h2 className="card-t">{p.free ? `Cancelar ${p.tickets} ${p.tickets === 1 ? "ingresso" : "ingressos"}?` : `Reembolsar ${brl(p.amountCents)}?`}</h2>
      {p.free ? (
        <p className="dl-p">Os ingressos grátis deixam de valer e os lugares voltam para a venda. Não há dinheiro a devolver.</p>
      ) : (
        <div className="rr-money big">
          <span>Volta para {o.buyer}</span><b className="rr-strong">{brl(p.amountCents)}</b>
          <span>{p.full ? "Tudo o que falta devolver neste pedido" : `${p.tickets} ${p.tickets === 1 ? "ingresso" : "ingressos"}, proporcional ao valor pago`}</span><b />
          <span>Taxa de serviço incluída (devolvida pela Tickets Win)</span><b>{brl(p.feeCents)}</b>
          <span>Sai do seu saldo no Banco Tickets Win</span><b>{p.test ? "nada (teste)" : brl(p.producerCents)}</b>
        </div>
      )}
      {!p.free && <p className="dl-p">{p.test ? "Pedido de teste: só marcamos como reembolsado, sem movimentar dinheiro." : MONEY_BACK}</p>}
      <p className="dl-p">Os ingressos {p.full ? "do pedido" : "escolhidos"} deixam de valer na portaria na hora{p.resale ? "" : " e os lugares voltam para a venda"}. {note ? "O comprador recebe um e-mail com o seu recado." : "O comprador recebe um e-mail avisando."}</p>
      {p.checkedIn > 0 && (
        <label className="rr-chk">
          <input type="checkbox" checked={okCheckedIn} onChange={(e) => setOkCheckedIn(e.target.checked)} />
          <span><b>{p.checkedIn === 1 ? "1 ingresso já entrou no evento." : `${p.checkedIn} ingressos já entraram no evento.`}</b> Quero reembolsar mesmo assim.</span>
        </label>
      )}
      <div className="dl-a">
        <button className="b2" type="button" onClick={onBack} disabled={busy}>Voltar</button>
        <button className="b2 danger" type="button" onClick={onConfirm} disabled={busy || blocked}>{busy ? "Processando…" : p.free ? "Cancelar ingressos" : `Reembolsar ${brl(p.amountCents)}`}</button>
      </div>
    </div>
  );
}

/* ---------------- pedidos de reembolso ---------------- */

function Requests({ p, onOpen }: { p: RefundTab; onOpen: (r: RequestRow) => void }) {
  return (
    <section className="cx">
      <div className="card-h"><div><h2 className="card-t">Pedidos de reembolso</h2><span className="card-s">{p.postponed?.open ? `Evento adiado: quem comprou antes do anúncio pode pedir até ${p.postponed.until}.` : "Compradores que pediram o dinheiro de volta."}</span></div></div>
      <Tbl label="Pedidos de reembolso">
        {p.requests.map((r) => (
          <button className="rr-or rr-rq" key={r.id} type="button" onClick={() => onOpen(r)}>
            <span className="rr-n">nº {r.number ?? "—"}<small>{r.at}</small></span>
            <span className="rr-b"><b>{r.buyer}</b><small>{r.message ? `“${r.message}”` : r.email}</small></span>
            <span className="rr-v">{r.total}<small>{r.reason}</small></span>
            <span className="st warn">Responder</span>
            <span className="rr-go" aria-hidden="true">›</span>
          </button>
        ))}
        {!p.requests.length && <div className="empty2"><b className="em-t">Nenhum pedido em aberto</b><span className="em-s">Os pedidos feitos pelos compradores no ingresso aparecem aqui.</span></div>}
      </Tbl>
    </section>
  );
}

/* ---------------- histórico ---------------- */

function HistoryLine({ h, onOpen }: { h: HistoryRow; onOpen?: (orderId: string) => void }) {
  return (
    <div className="rr-h">
      <span className="rr-hd">{h.at}</span>
      <span className="rr-hi">
        <b>{onOpen ? <button type="button" className="rr-lk" onClick={() => onOpen(h.orderId)}>nº {h.number ?? "—"} · {h.buyer}</button> : h.kind}{onOpen ? <> · {h.kind}</> : null}</b>
        <small>{[h.codes.length ? h.codes.join(", ") : null, `por ${h.actor}`, h.test ? "teste" : null, h.stripeId || null].filter(Boolean).join(" · ")}</small>
        {h.reason && <small>“{h.reason}”</small>}
        {h.status === "failed" && h.error && <small className="rr-err">{h.error}</small>}
      </span>
      <span className="rr-hv">{h.free ? "Grátis" : h.amount}<small>{h.status === "failed" ? "nada foi devolvido" : h.free ? "sem dinheiro" : h.test ? "teste, sem saldo" : `−${h.producer} do saldo`}</small></span>
      <span className={ROW_ST[h.status][1]}>{ROW_ST[h.status][0]}</span>
    </div>
  );
}

function History({ rows, onOpen }: { rows: HistoryRow[]; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className="cx">
      <div className="card-h"><div><h2 className="card-t">Histórico</h2><span className="card-s">Quem reembolsou o quê, quando, quanto e por quê.</span></div></div>
      <Tbl label="Histórico de reembolsos">
        {shown.map((h) => <HistoryLine key={h.id} h={h} onOpen={onOpen} />)}
        {!rows.length && <div className="empty2"><b className="em-t">Nenhum reembolso ainda</b><span className="em-s">Cada reembolso e cancelamento fica registrado aqui.</span></div>}
      </Tbl>
      {rows.length > shown.length && <button className="b2 rr-more" type="button" onClick={() => setAll(true)}>Ver todos ({rows.length})</button>}
    </section>
  );
}

/* ---------------- política ---------------- */

function Policy({ p }: { p: RefundTab }) {
  const router = useRouter();
  const { flash } = useToast();
  const [f, setF] = useState<CancelPolicy>(p.policy);
  const [busy, start] = useTransition();
  const dirty = f.mode !== p.policy.mode || (f.mode === "until" && f.hoursBefore !== p.policy.hoursBefore);
  const save = () => start(async () => {
    const r = await saveCancelPolicy({ eventId: p.eventId, ...f });
    if (!r.ok) { flash(r.error); return; }
    flash("Política salva. Ela aparece na página do evento e no ingresso."); router.refresh();
  });
  return (
    <section className="cx">
      <div className="card-h"><div><h2 className="card-t">Política de cancelamento</h2><span className="card-s">O que o comprador pode cancelar sozinho, pelo ingresso.</span></div></div>
      <div className="frm">
        <label className="rr-opt">
          <input type="radio" name="pol" checked={f.mode === "legal"} onChange={() => setF({ ...f, mode: "legal" })} />
          <span><b>Só o direito de arrependimento</b><small>Até {LEGAL_DAYS} dias após a compra, com mais de {LEGAL_MIN_HOURS} horas para o evento. É o mínimo da lei e vale sempre.</small></span>
        </label>
        <label className="rr-opt">
          <input type="radio" name="pol" checked={f.mode === "until"} onChange={() => setF({ ...f, mode: "until" })} />
          <span><b>Também até um prazo antes do evento</b><small>Além dos {LEGAL_DAYS} dias, o comprador cancela pelo site até o prazo escolhido.</small></span>
        </label>
        {f.mode === "until" && (
          <>
            <label className="fld">
              <span>Cancelar até</span>
              <select value={f.hoursBefore} onChange={(e) => setF({ ...f, hoursBefore: Number(e.target.value) })}>
                {POLICY_HOURS.map((h) => <option key={h} value={h}>{hoursLabel(h)} antes do início</option>)}
              </select>
            </label>
            <p className="rr-note">Fora dos {LEGAL_DAYS} dias de arrependimento, o comprador recebe o valor do ingresso: a taxa de serviço da Tickets Win não é devolvida.</p>
          </>
        )}
        <p className="rr-note">{policyText(f)}</p>
        <button className="b2 dark" type="button" disabled={!dirty || busy} onClick={save}>{busy ? "Salvando…" : "Salvar política"}</button>
      </div>
    </section>
  );
}

/* ---------------- adiar ---------------- */

function Postpone({ p }: { p: RefundTab }) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(p.startLocal);
  const [note, setNote] = useState("");
  const [busy, run] = useTransition();
  const go = () => run(async () => {
    const r = await postponeEventAction({ eventId: p.eventId, start, note });
    if (!r.ok) { flash(r.error); return; }
    flash(`Evento adiado. Os compradores foram avisados e podem pedir reembolso até ${r.until}.`);
    setOpen(false); router.refresh();
  });
  return (
    <section className="cx">
      <div className="card-h"><div><h2 className="card-t">Adiar o evento</h2><span className="card-s">Muda a data, avisa todo mundo por e-mail e mantém os ingressos válidos.</span></div></div>
      <button className="b2 block" type="button" onClick={() => setOpen(true)}>Adiar para outra data</button>
      {open && (
        <PainelPortal>
          <div className="ml-ov" role="dialog" aria-modal="true" aria-label="Adiar o evento" onClick={() => !busy && setOpen(false)}>
            <div className="ml-dlg dl-dlg" onClick={(e) => e.stopPropagation()}>
              <form onSubmit={(e) => { e.preventDefault(); go(); }}>
                <h2 className="card-t">Adiar “{p.title}”</h2>
                <p className="dl-p">Hoje: {p.startLabel}. Todas as datas e horários do evento andam junto. Os ingressos continuam valendo, com o mesmo QR code.</p>
                <label className="fld"><span>Nova data e horário de início</span><input autoComplete="off" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
                <label className="fld"><span>Recado para os compradores (opcional)</span><textarea maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Por causa da chuva, o show passou para o próximo sábado." /></label>
                <ul className="rv-how">
                  <li>Todos que compraram e a lista free recebem um e-mail com a nova data.</li>
                  <li>Pelos Termos, quem comprou pode pedir reembolso integral em até {POSTPONE_REFUND_DAYS} dias. Os pedidos aparecem aqui para você aprovar.</li>
                </ul>
                <div className="dl-a"><button className="b2" type="button" onClick={() => setOpen(false)} disabled={busy}>Voltar</button><button className="b2 dark" type="submit" disabled={busy || !start}>{busy ? "Adiando…" : "Adiar e avisar"}</button></div>
              </form>
            </div>
          </div>
        </PainelPortal>
      )}
    </section>
  );
}

/* ---------------- cancelar o evento ---------------- */

function CancelEvent({ p }: { p: RefundTab }) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, run] = useTransition();
  const ok = typed.trim().toLowerCase() === p.title.trim().toLowerCase();
  const go = () => run(async () => {
    const r = await cancelEventAction({ eventId: p.eventId, confirmTitle: typed, reason });
    if (!r.ok) { flash(r.error); return; }
    flash("Evento cancelado. Os reembolsos começaram.");
    setOpen(false); router.refresh();
  });
  return (
    <section className="cx rr-danger">
      <div className="card-h"><div><h2 className="card-t">Cancelar o evento</h2><span className="card-s">Para as vendas e devolve o dinheiro de todo mundo.</span></div></div>
      <button className="b2 danger block" type="button" onClick={() => setOpen(true)}>Cancelar evento</button>
      {open && (
        <PainelPortal>
          <div className="ml-ov" role="dialog" aria-modal="true" aria-label="Cancelar o evento" onClick={() => !busy && setOpen(false)}>
            <div className="ml-dlg dl-dlg" onClick={(e) => e.stopPropagation()}>
              <form onSubmit={(e) => { e.preventDefault(); if (ok) go(); }}>
                <span className="dl-ic" aria-hidden="true">!</span>
                <h2 className="card-t">Cancelar “{p.title}”?</h2>
                <ul className="rv-how">
                  <li>As vendas param na hora, os anúncios da revenda saem do ar e os pedidos em pagamento são cancelados.</li>
                  <li>Todos os pedidos pagos são reembolsados <b>integralmente, com a taxa de serviço</b>, para o meio de pagamento original.</li>
                  <li>Sai do seu saldo no Banco Tickets Win o líquido de cada venda. Se você já sacou, o saldo fica negativo.</li>
                  <li>Compradores, quem recebeu ingresso e a lista free recebem um e-mail.</li>
                </ul>
                <p className="dl-p"><b>Isso não dá para desfazer.</b> Se o evento só mudou de data, use Adiar.</p>
                <label className="fld"><span>Motivo (vai no e-mail para os compradores)</span><textarea maxLength={600} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: O artista cancelou a turnê por motivo de saúde." /></label>
                <label className="fld"><span>Para confirmar, digite o nome do evento</span><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={p.title} autoComplete="off" /></label>
                <div className="dl-a"><button className="b2" type="button" onClick={() => setOpen(false)} disabled={busy}>Voltar</button><button className="b2 danger" type="submit" disabled={!ok || busy}>{busy ? "Cancelando…" : "Cancelar e reembolsar todos"}</button></div>
              </form>
            </div>
          </div>
        </PainelPortal>
      )}
    </section>
  );
}

/** Andamento do reembolso do evento cancelado: roda lotes enquanto a página está aberta (o cron continua sozinho). */
function CancelStatus({ p, onOpen }: { p: RefundTab; onOpen: (orderId: string) => void }) {
  const router = useRouter();
  const { flash } = useToast();
  const [g, setG] = useState<CancelProgress | null>(p.progress);
  const [running, setRunning] = useState(!!p.progress && p.progress.left > p.progress.failed.length);
  const [busy, run] = useTransition();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!running) return () => { alive.current = false; };
    (async () => {
      for (let i = 0; i < 400 && alive.current; i++) {
        const r = await cancelStep(p.eventId).catch(() => null);
        if (!alive.current) return;
        if (!r || !r.ok) { setRunning(false); return; }
        setG(r.progress);
        if (!r.more) { setRunning(false); router.refresh(); return; }
        await new Promise((res) => setTimeout(res, 1200));
      }
    })();
    return () => { alive.current = false; };
  }, [running, p.eventId, router]);
  const retry = () => run(async () => {
    const r = await cancelStep(p.eventId, true);
    if (!r.ok) { flash(r.error); return; }
    setG(r.progress);
    flash(r.progress.failed.length ? "Alguns ainda falharam. Veja o motivo de cada um." : "Reembolsos refeitos.");
    if (r.more) setRunning(true);
    router.refresh();
  });
  const pct = g && g.total ? Math.round((g.refunded / g.total) * 100) : 100;
  return (
    <section className="cx rr-cancel">
      <div className="card-h">
        <div><h2 className="card-t">Evento cancelado{p.cancelledAt ? ` em ${p.cancelledAt}` : ""}</h2><span className="card-s">{p.cancelReason ? `Motivo: ${p.cancelReason}` : "As vendas estão encerradas."}</span></div>
        <span className="st end">Cancelado</span>
      </div>
      {g && (
        <>
          <div className="rr-prog"><span className="bar"><i style={{ width: `${pct}%` }} /></span><b>{g.refunded} de {g.total} reembolsados</b></div>
          <span className="card-s">
            {g.left === 0 ? `Todos os pedidos pagos foram reembolsados (${brl(g.refundedCents)}).`
              : running ? `Reembolsando… ${brl(g.refundedCents)} devolvidos até agora. Pode fechar a página: o processo continua sozinho a cada minuto.`
                : `${g.left} ${g.left === 1 ? "pedido falta" : "pedidos faltam"}. ${brl(g.refundedCents)} devolvidos até agora.`}
          </span>
          {g.failed.length > 0 && (
            <div className="rr-fail">
              <b>{g.failed.length === 1 ? "1 reembolso falhou" : `${g.failed.length} reembolsos falharam`}</b>
              {g.failed.slice(0, 8).map((f) => <button key={f.orderId} type="button" className="rr-lk" onClick={() => onOpen(f.orderId)}>nº {f.number ?? "—"} · {f.buyer}: {f.error} ({f.attempts} {f.attempts === 1 ? "tentativa" : "tentativas"})</button>)}
              <button className="b2 dark" type="button" disabled={busy} onClick={retry}>{busy ? "Tentando…" : "Tentar de novo"}</button>
            </div>
          )}
          {!running && g.left > g.failed.length && <button className="b2" type="button" onClick={() => setRunning(true)}>Continuar agora</button>}
        </>
      )}
    </section>
  );
}
