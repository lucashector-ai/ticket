import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlyerArt } from "@/components/art/flyer";
import { ExpiryCountdown } from "@/components/checkout/expiry";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { payOrderForm } from "@/lib/actions/checkout";
import { cancelOrderForm } from "@/lib/actions/checkout-ui";
import { getSessionUser } from "@/lib/auth/server";
import { getOrderForUser } from "@/lib/data/user";
import { brl, dateNice } from "@/lib/format";
import { stripeEnabled } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pagamento" };

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ erro?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ orderId }, { erro }] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/checkout/${orderId}`)}`);
  if (!UUID.test(orderId)) notFound();
  const order = await getOrderForUser(orderId, user.id);
  if (!order) notFound();

  const ev = order.event;
  const expired = order.status === "expired" || (order.status === "pending" && !!order.expiresAt && order.expiresAt < new Date());
  const pending = order.status === "pending" && !expired;
  // pedido não pago e dentro da reserva: o checkout do evento retoma de onde parou (mesmo Pix / mesmo pedido)
  if (pending) redirect(`/checkout?pedido=${order.id}`);
  const venue = ev.venueNameOverride ?? ev.venue?.name ?? "";
  const city = ev.venue ? `${ev.venue.city.name}, ${ev.venue.city.uf}` : "";
  const qty = order.items.reduce((s, i) => s + i.quantity, 0);
  const headerUser = { id: user.id, name: user.name, email: user.email, image: user.image };
  /** pagamento de verdade ligado: esta página antiga não confirma pedido com valor (o checkout do evento cobra pela Stripe) */
  const live = stripeEnabled() && order.totalCents > 0;

  return (
    <div className="pg-checkout">
      <SiteHeader user={headerUser} variant="default" />
      <main className="wrap ck-main">
        <nav className="ck-crumb" aria-label="Navegação">
          <Link href={`/eventos/${ev.slug}`}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
            Voltar ao evento
          </Link>
          <span aria-hidden="true">/</span>
          <span>Pedido #{order.number}</span>
        </nav>

        <div className="ck-grid">
          <section className="ck-col" aria-labelledby="ck-t">
            <h1 className="ck-h" id="ck-t">{pending ? "Pagamento" : order.status === "paid" ? "Pedido confirmado" : "Pedido encerrado"}</h1>
            <p className="ck-sub">
              {pending && <>Confira o pedido e escolha como pagar. <ExpiryCountdown expiresAt={order.expiresAt?.toISOString() ?? new Date().toISOString()} /></>}
              {order.status === "paid" && <>Seus ingressos já estão disponíveis. Pedido #{order.number}{order.paymentRef?.startsWith("TEST-") ? ", pago em modo de teste" : ""}.</>}
              {expired && order.status !== "paid" && <>O tempo da reserva acabou. Volte ao evento para escolher os ingressos de novo.</>}
              {(order.status === "cancelled" || order.status === "refunded") && <>Este pedido foi {order.status === "cancelled" ? "cancelado" : "reembolsado"}.</>}
            </p>

            {erro && (
              <div className="ck-alert" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                {erro}
              </div>
            )}

            {order.status === "paid" && (
              <div className="ck-card ck-ok">
                <span className="ck-ok-i" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div>
                  <b>{qty} {qty === 1 ? "ingresso emitido" : "ingressos emitidos"}</b>
                  <span>Os QR codes ficam em Meus ingressos e também chegam no seu e-mail.</span>
                </div>
                <Link className="btn-p" href={`/meus-ingressos?pedido=${order.number}`}>
                  Ver meus ingressos
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </Link>
              </div>
            )}

            {!pending && order.status !== "paid" && (
              <div className="ck-card ck-end">
                <b>{expired ? "Reserva expirada" : order.status === "cancelled" ? "Pedido cancelado" : "Pedido reembolsado"}</b>
                <span>Os lotes continuam disponíveis enquanto houver ingressos.</span>
                <Link className="btn-p" href={`/eventos/${ev.slug}`}>Voltar ao evento</Link>
              </div>
            )}

            {pending && (
              <>
                <div className="ck-card">
                  <h2>Comprador</h2>
                  <dl className="ck-buyer">
                    <div><dt>Nome</dt><dd>{order.buyerName ?? user.name ?? "—"}</dd></div>
                    <div><dt>E-mail</dt><dd>{order.buyerEmail ?? user.email ?? "—"}</dd></div>
                  </dl>
                  <p className="ck-hint">Os ingressos são nominais e ficam vinculados a esta conta. Você pode transferir depois, em Meus ingressos.</p>
                </div>

                {live ? (
                  <div className="ck-card ck-end">
                    <b>Finalize pelo checkout do evento</b>
                    <span>O pagamento com Pix ou cartão é feito no checkout do evento. Escolha os ingressos de novo para pagar.</span>
                    <Link className="btn-p" href={`/eventos/${ev.slug}`}>Voltar ao evento</Link>
                  </div>
                ) : <form action={payOrderForm} className="ck-card">
                  <input type="hidden" name="orderId" value={order.id} />
                  <h2>Como você quer pagar?</h2>
                  <div className="ck-methods">
                    <label className="ck-m">
                      <input type="radio" name="method" value="pix" defaultChecked />
                      <span className="ck-m-i" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l4.2 4.2a2 2 0 0 1 0 2.8L12 14.2 7.8 10a2 2 0 0 1 0-2.8z" /><path d="M12 9.8l4.2 4.2a2 2 0 0 1 0 2.8L12 21l-4.2-4.2a2 2 0 0 1 0-2.8z" /></svg>
                      </span>
                      <span className="ck-m-t"><b>Pix</b><small>Aprovação na hora · QR code ou copia e cola</small></span>
                      <span className="ck-m-tag">Sem taxa extra</span>
                    </label>
                    <label className="ck-m">
                      <input type="radio" name="method" value="card" />
                      <span className="ck-m-i" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M3 10h18M7 14.5h4" /></svg>
                      </span>
                      <span className="ck-m-t"><b>Cartão de crédito</b><small>Em até 6x · até 3x sem juros</small></span>
                    </label>
                  </div>
                  <p className="ck-test">
                    <span className="ck-test-k">Ambiente de teste</span>
                    Nenhuma cobrança real é feita nesta fase: o pedido é confirmado na hora e os ingressos são emitidos para a sua conta.
                  </p>
                  <button className="btn-p ck-pay" type="submit">
                    Pagar {brl(order.totalCents)} (ambiente de teste)
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                  </button>
                  <p className="ck-legal">Ao pagar, você concorda com os <Link href="/legal/termos">termos de uso</Link> e com a política de cancelamento do produtor.</p>
                </form>}

                <form action={cancelOrderForm} className="ck-cancel">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="eventSlug" value={ev.slug} />
                  <button type="submit">Cancelar pedido</button>
                </form>
              </>
            )}
          </section>

          <aside className="ck-side">
            <div className="ck-card ck-sum">
              <div className="ck-ev">
                <div className="ck-fly"><FlyerArt id={ev.flyerId} /></div>
                <div className="ck-ev-t">
                  <span className="ck-k">Resumo do pedido</span>
                  <b>{ev.title}</b>
                  <span>{ev.dateLabel ?? dateNice(ev.startAt)}</span>
                  <span>{venue}{city && ` · ${city}`}</span>
                </div>
              </div>
              <ul className="ck-items">
                {order.items.map((it) => (
                  <li key={it.id}>
                    <span>{it.quantity} × {it.ticketType.name}</span>
                    <b>{brl(it.unitPriceCents * it.quantity)}</b>
                  </li>
                ))}
              </ul>
              <dl className="ck-tot">
                <div><dt>Subtotal</dt><dd>{brl(order.subtotalCents)}</dd></div>
                <div><dt>Taxa de serviço</dt><dd>{brl(order.feeCents)}</dd></div>
                {order.discountCents > 0 && (
                  <div className="disc"><dt>Desconto{order.coupon ? ` (${order.coupon.code})` : ""}</dt><dd>− {brl(order.discountCents)}</dd></div>
                )}
                <div className="total"><dt>Total</dt><dd>{brl(order.totalCents)}</dd></div>
              </dl>
              <p className="ck-note">Meia-entrada conforme a lei. Ingresso digital e nominal, com QR code. Dá para transferir em Meus ingressos se o produtor permitir.</p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
