import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlyerArt } from "@/components/art/flyer";
import { ContaShell } from "@/components/conta/shell";
import { DeliveryActions, PedidoCancel, PendingActions } from "@/components/conta/pedido";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { contaUser } from "@/lib/data/conta";
import { orderDetail } from "@/lib/data/pedido";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Detalhes do pedido", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Arrow() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>;
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await contaUser(`/conta/compras/${id}`);
  if (!UUID.test(id)) notFound();
  // só o dono do pedido: para qualquer outra conta é como se não existisse
  const d = await orderDetail(id, user.id);
  if (!d) notFound();
  const m = d.money;
  const receipt = d.status === "paid" || d.status === "refunded";
  const help = (assunto: string) => `/contato?pedido=${d.number}&assunto=${assunto}`;

  return (
    <div className="pg-conta">
      <SiteHeader user={user} variant="default" activePath="/conta" />
      <ContaShell name={profile?.name || user.name || ""} email={user.email} avatar={profile?.avatarUrl ?? user.image ?? null} mfa={!!profile?.mfaMethod}>
        <nav className="od-crumb" aria-label="Navegação">
          <Link href="/conta/compras"><Arrow />Minhas compras</Link>
        </nav>

        <header className="ct-card od-hero">
          <Link className="od-art" href={`/eventos/${d.event.slug}`} aria-hidden="true" tabIndex={-1}><FlyerArt id={d.event.flyerId} /></Link>
          <div className="od-hero-t">
            <span className="od-meta">
              <span className={`ct-pill ${d.pill.cls}`}>{d.pill.label}</span>
              <span>Pedido nº {d.number}</span>
              {d.test && <span className="ct-pill">Teste</span>}
            </span>
            <h1 className="od-title">{d.event.title}</h1>
            <p className="od-ev">{d.event.when}</p>
            {d.event.where && <p className="od-ev">{d.event.where}</p>}
            <Link className="ct-link" href={`/eventos/${d.event.slug}`}>Ver página do evento</Link>
          </div>
          <div className="od-hero-r">
            <small>Total</small>
            <b>{m.totalCents ? brl(m.totalCents) : "Grátis"}</b>
            {m.refundedCents > 0 && <small className="od-ref">{brl(m.refundedCents)} reembolsados</small>}
          </div>
          <p className="od-bought">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            Comprado em {d.purchasedAt}
          </p>
        </header>

        {d.event.status === "cancelled" && (
          <div className="od-alert bad" role="note"><b>Evento cancelado pelo produtor.</b> O reembolso é integral, com a taxa de serviço, e automático.</div>
        )}
        {d.event.postponed && d.event.status !== "cancelled" && (
          <div className="od-alert warn" role="note"><b>Evento adiado.</b> Era {d.event.postponed.from}; a nova data é {d.event.postponed.to}. Seus ingressos valem para a nova data.</div>
        )}
        {d.pendingOpen && (
          <div className="od-alert warn od-alert-a" role="note">
            <span><b>Aguardando pagamento.</b> {d.expiresAt ? `Os ingressos ficam reservados até ${d.expiresAt}.` : ""} Nada foi cobrado ainda.</span>
            <PendingActions orderId={d.id} />
          </div>
        )}
        {d.pill.label === "Expirado" && (
          <div className="od-alert" role="note"><b>A reserva expirou.</b> O pagamento não foi concluído a tempo e nada foi cobrado. <Link href={`/eventos/${d.event.slug}`}>Escolher ingressos de novo</Link></div>
        )}

        <div className="od-grid">
          <div className="od-col">
            {d.tickets.length > 0 && (
              <section className="ct-card od-sec" aria-labelledby="od-tk-t">
                <h2 className="ct-h" id="od-tk-t">Ingressos <span className="od-count">{d.tickets.length}</span></h2>
                <ul className="od-tks">
                  {d.tickets.map((t) => (
                    <li key={t.id} className="od-tk">
                      <span className="od-tk-i">
                        <b>{t.holder}</b>
                        <small>{t.tier}{t.half ? " · Meia-entrada" : ""}</small>
                        <code>{t.code}</code>
                      </span>
                      <span className={`ct-pill ${t.tone}`}>{t.status}</span>
                      <span className="od-tk-a">
                        {t.pending && <DeliveryActions transferId={t.pending.transferId} ticketId={t.pending.ticketId} email={t.pending.email} />}
                        {t.mine && !t.pending && <Link className="ct-b sm ghost" href={`/ingressos/${t.code}`}>Ver ingresso</Link>}
                      </span>
                    </li>
                  ))}
                </ul>
                {d.movedOut > 0 && <p className="ct-note">{d.movedOut === 1 ? "1 ingresso saiu" : `${d.movedOut} ingressos saíram`} deste pedido pela revenda oficial.</p>}
                <p className="ct-note">Para transferir ou revender, abra o ingresso. Ingressos enviados para outra pessoa só valem depois que ela aceitar pelo e-mail.</p>
              </section>
            )}

            <section className="ct-card od-sec" aria-labelledby="od-val-t">
              <h2 className="ct-h" id="od-val-t">Valores</h2>
              <dl className="od-sum">
                {m.lines.map((l, i) => (
                  <div key={i}>
                    <dt><span>{l.qty} × {l.label}</span><small>{[l.sub, l.unitCents ? `${brl(l.unitCents)} cada` : "grátis"].filter(Boolean).join(" · ")}</small></dt>
                    <dd>{l.totalCents ? brl(l.totalCents) : "Grátis"}</dd>
                  </div>
                ))}
                {m.discountCents > 0 && <div className="disc"><dt><span>Desconto{m.coupon ? ` (cupom ${m.coupon})` : ""}</span></dt><dd>− {brl(m.discountCents)}</dd></div>}
                {m.totalCents > 0 && (
                  <div><dt><span>Taxa de serviço{m.absorbFee ? "" : " (7,99%)"}</span>{m.absorbFee && <small>Paga pelo produtor</small>}</dt><dd>{m.absorbFee ? "Inclusa" : brl(m.feeCents)}</dd></div>
                )}
                {m.interestCents > 0 && <div><dt><span>Juros do parcelamento ({m.installments}x)</span></dt><dd>{brl(m.interestCents)}</dd></div>}
                <div className="tot"><dt><span>{receipt ? "Total pago" : "Total"}</span></dt><dd>{m.totalCents ? brl(m.totalCents) : "Grátis"}</dd></div>
                {m.refundedCents > 0 && <div className="ref"><dt><span>Reembolsado até agora</span></dt><dd>− {brl(m.refundedCents)}</dd></div>}
                {m.pendingRefundCents > 0 && <div className="ref"><dt><span>Reembolso em processamento</span></dt><dd>{brl(m.pendingRefundCents)}</dd></div>}
                {m.keptFeeCents > 0 && <div><dt><span>Taxa de serviço não reembolsada</span><small>Cancelamento fora dos 7 dias</small></dt><dd>{brl(m.keptFeeCents)}</dd></div>}
                {m.refundedCents > 0 && <div className="net"><dt><span>Valor final do pedido</span></dt><dd>{brl(m.netCents)}</dd></div>}
              </dl>
            </section>

            {d.status === "paid" && <PedidoCancel orderId={d.id} number={d.number} c={d.cancel} />}
          </div>

          <div className="od-col">
            <section className="ct-card od-sec" aria-labelledby="od-pay-t">
              <h2 className="ct-h" id="od-pay-t">Pagamento</h2>
              <dl className="od-kv">
                <div><dt>Forma</dt><dd>{d.payment.free ? "Grátis (sem cobrança)" : d.payment.test ? `${d.payment.method} · teste` : d.payment.method}</dd></div>
                {d.payment.installments && <div><dt>Parcelas</dt><dd>{d.payment.installments}</dd></div>}
                {d.payment.paidAt && <div><dt>{d.payment.free ? "Confirmado em" : "Aprovado em"}</dt><dd>{d.payment.paidAt}</dd></div>}
                {d.payment.ref && <div><dt>Referência</dt><dd><code className="od-ref-c" title="Final da referência do pagamento">{d.payment.ref}</code></dd></div>}
              </dl>
              {d.payment.test && <p className="ct-note">Pedido feito no modo de teste: nenhum valor foi cobrado de verdade.</p>}
            </section>

            <section className="ct-card od-sec" aria-labelledby="od-tl-t">
              <h2 className="ct-h" id="od-tl-t">Linha do tempo</h2>
              <ol className="od-tl">
                {d.timeline.map((x, i) => (
                  <li key={i} className={x.tone ?? ""}>
                    <b>{x.title}</b>
                    <time dateTime={x.at.toISOString()}>{x.when}</time>
                    {x.text && <small>{x.text}</small>}
                  </li>
                ))}
              </ol>
            </section>

            <section className="ct-card od-sec" aria-labelledby="od-buy-t">
              <h2 className="ct-h" id="od-buy-t">Comprador</h2>
              <dl className="od-kv">
                <div><dt>Nome</dt><dd>{d.buyer.name || "—"}</dd></div>
                <div><dt>E-mail</dt><dd>{d.buyer.email || "—"}</dd></div>
                {d.buyer.phone && <div><dt>Celular</dt><dd>{d.buyer.phone}</dd></div>}
                {d.buyer.cpf && <div><dt>CPF</dt><dd>{d.buyer.cpf}</dd></div>}
              </dl>
            </section>
          </div>
        </div>

        <section className="ct-card od-help" aria-labelledby="od-help-t">
          <div className="od-help-t">
            <h2 className="ct-h" id="od-help-t">Precisa de ajuda com este pedido?</h2>
            <p className="ct-v">Fale com a Tickets Win. O número do pedido já vai junto na mensagem.</p>
          </div>
          <div className="od-help-a">
            <Link className="ct-b ghost" href={help("pagamento")}>Pagamento</Link>
            <Link className="ct-b ghost" href={help("ingressos")}>Ingressos e QR code</Link>
            <Link className="ct-b ghost" href={help("reembolso")}>Cancelamento ou reembolso</Link>
            {receipt && <Link className="ct-b dark" href={`/conta/compras/${d.id}/comprovante`}>Baixar comprovante</Link>}
          </div>
        </section>
      </ContaShell>
      <SiteFooter />
    </div>
  );
}
