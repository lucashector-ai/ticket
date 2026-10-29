import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/conta/pedido";
import { getSessionUser } from "@/lib/auth/server";
import { orderDetail } from "@/lib/data/pedido";
import { brl, dateTimeShort } from "@/lib/format";
import { COMPANY, SUPPORT } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comprovante de compra", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comprovante simples para imprimir ou salvar em PDF (pelo navegador). Só o dono do pedido, só pedido pago. */
export default async function ComprovantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/conta/compras/${id}/comprovante`)}`);
  if (!UUID.test(id)) notFound();
  const d = await orderDetail(id, user.id);
  if (!d || !(d.status === "paid" || d.status === "refunded")) notFound();
  const m = d.money;

  return (
    <div className="pg-recibo">
      <div className="rc-bar">
        <Link className="rc-back" href={`/conta/compras/${d.id}`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
          Voltar ao pedido
        </Link>
        <PrintButton className="rc-print" />
      </div>

      <main className="rc-doc">
        <header className="rc-head">
          <div>
            <span className="rc-logo">Tickets Win</span>
            <p>{COMPANY.legalName}<br />CNPJ {COMPANY.cnpj ?? "em registro"} · {COMPANY.city}<br />{SUPPORT.email}</p>
          </div>
          <div className="rc-head-r">
            <h1>Comprovante de compra</h1>
            <p>Pedido nº <b>{d.number}</b></p>
          </div>
        </header>

        <dl className="rc-kv">
          <div><dt>Data da compra</dt><dd>{d.purchasedAt}</dd></div>
          {d.payment.paidAt && <div><dt>Pagamento aprovado</dt><dd>{d.payment.paidAt}</dd></div>}
          <div><dt>Situação</dt><dd>{d.pill.label}</dd></div>
          <div><dt>Forma de pagamento</dt><dd>{d.payment.free ? "Grátis (sem cobrança)" : `${d.payment.method}${d.payment.installments ? ` · ${d.payment.installments}` : ""}${d.payment.test ? " · teste" : ""}`}</dd></div>
          {d.payment.ref && <div><dt>Referência do pagamento</dt><dd>{d.payment.ref}</dd></div>}
        </dl>

        <section className="rc-sec">
          <h2>Comprador</h2>
          <p>{d.buyer.name || "—"}<br />{d.buyer.email}{d.buyer.cpf ? <><br />CPF {d.buyer.cpf}</> : null}</p>
        </section>

        <section className="rc-sec">
          <h2>Evento</h2>
          <p><b>{d.event.title}</b><br />{d.event.when}{d.event.where ? <><br />{d.event.where}</> : null}</p>
        </section>

        <table className="rc-tb">
          <caption>Itens do pedido</caption>
          <thead><tr><th scope="col">Ingresso</th><th scope="col">Qtd.</th><th scope="col">Unitário</th><th scope="col">Valor</th></tr></thead>
          <tbody>
            {m.lines.map((l, i) => (
              <tr key={i}><td>{l.label}{l.sub ? <small>{l.sub}</small> : null}</td><td>{l.qty}</td><td>{brl(l.unitCents)}</td><td>{brl(l.totalCents)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            {m.discountCents > 0 && <tr><th scope="row" colSpan={3}>Desconto{m.coupon ? ` (cupom ${m.coupon})` : ""}</th><td>− {brl(m.discountCents)}</td></tr>}
            {m.totalCents > 0 && <tr><th scope="row" colSpan={3}>Taxa de serviço{m.absorbFee ? " (paga pelo produtor)" : " (7,99%)"}</th><td>{m.absorbFee ? "Inclusa" : brl(m.feeCents)}</td></tr>}
            {m.interestCents > 0 && <tr><th scope="row" colSpan={3}>Juros do parcelamento ({m.installments}x)</th><td>{brl(m.interestCents)}</td></tr>}
            <tr className="tot"><th scope="row" colSpan={3}>Total pago</th><td>{m.totalCents ? brl(m.totalCents) : "Grátis"}</td></tr>
            {m.refundedCents > 0 && <tr><th scope="row" colSpan={3}>Reembolsado</th><td>− {brl(m.refundedCents)}</td></tr>}
            {m.refundedCents > 0 && <tr className="tot"><th scope="row" colSpan={3}>Valor final</th><td>{brl(m.netCents)}</td></tr>}
          </tfoot>
        </table>

        {d.tickets.length > 0 && (
          <section className="rc-sec">
            <h2>Ingressos emitidos</h2>
            <ul className="rc-tks">
              {d.tickets.map((t) => <li key={t.id}><code>{t.code}</code> {t.holder} · {t.tier}{t.half ? " · Meia-entrada" : ""}</li>)}
            </ul>
          </section>
        )}

        <footer className="rc-foot">
          <p>Emitido em {dateTimeShort(new Date(), " às ")} (horário de Brasília). Este comprovante não substitui o ingresso nem a nota fiscal.</p>
          <p>{d.test ? "Pedido feito no modo de teste: nenhum valor foi cobrado." : "Dúvidas sobre este pedido: " + SUPPORT.email + " ou WhatsApp " + SUPPORT.whatsapp + "."}</p>
        </footer>
      </main>
    </div>
  );
}
