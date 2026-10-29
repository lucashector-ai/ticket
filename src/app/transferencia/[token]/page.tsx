import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { FlyerArt } from "@/components/art/flyer";
import { AcceptTransfer } from "@/components/ingressos/accept-transfer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { userContact } from "@/lib/notify";
import { eventLabels } from "@/lib/tickets/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ingresso recebido", robots: { index: false } };

/**
 * Link do e-mail de transferência: mostra o ingresso e aceita na conta logada.
 * Também recebe o ingresso de outra pessoa enviado na compra (kind "gift"): aí só a conta do e-mail informado
 * no pedido pode receber (entrar ou criar conta volta para cá pelo ?next=).
 */
export default async function TransferenciaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  const tr = await db.query.ticketTransfers.findFirst({ where: eq(schema.ticketTransfers.token, token) });
  if (!tr) notFound();
  const t = await db.query.tickets.findFirst({
    where: eq(schema.tickets.id, tr.ticketId),
    with: { ticketType: { columns: { name: true } }, event: { with: { venue: { with: { city: true } } } }, order: { columns: { buyerName: true } } },
  });
  if (!t) notFound();
  const gift = tr.kind === "gift";
  const user = await getSessionUser();
  const from = gift && t.order?.buyerName ? { name: t.order.buyerName } : await userContact(tr.fromUserId);
  const fromFirst = from?.name?.split(" ")[0] || (gift ? "Alguém" : "um amigo");
  const L = eventLabels(t.event);
  const next = `/transferencia/${token}`;
  const mine = tr.status === "accepted" && !!user && tr.toUserId === user.id;
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-grupo">
      <SiteHeader user={headerUser} variant="default" />
      <main className="wrap gp">
        <section className="gp-card">
          <div className="gp-ev">
            <div className="gp-art"><FlyerArt id={t.event.flyerId} /></div>
            <div className="gp-ei">
              <span className="gp-k">{gift ? `${fromFirst} te mandou um ingresso` : `Ingresso enviado por ${fromFirst}`}</span>
              <h1 className="gp-t">{t.event.title}</h1>
              <span className="gp-d">{L.dateNice}{L.venue ? ` · ${L.venue}` : ""}</span>
            </div>
          </div>
          {gift ? (
            <div className="gp-st">
              <b>{t.ticketType.name}{t.halfPrice ? " · meia-entrada" : ""}{t.holderName ? ` · ${t.holderName}` : ""}</b>
              <span>{from?.name || "Quem comprou"} comprou este ingresso para <strong>{tr.toEmail}</strong>. Entre ou crie sua conta com esse e-mail e receba: o ingresso vai para a sua conta com um QR code novo, só seu.{t.halfPrice ? " Leve o documento da meia-entrada." : ""}</span>
            </div>
          ) : (
            <div className="gp-st"><b>{t.ticketType.name}{t.halfPrice ? " · meia-entrada" : ""}</b><span>Enviado para {tr.toEmail}. Ao aceitar, o ingresso vai para a sua conta com um QR code novo, só seu.</span></div>
          )}
          {tr.status === "cancelled" || tr.status === "expired" ? (
            <div className="gp-st off"><b>{gift ? "Envio cancelado" : "Transferência cancelada"}</b><span>Quem enviou desfez {gift ? "o envio" : "a transferência"}. Este link não vale mais.</span></div>
          ) : tr.status === "accepted" && !mine ? (
            <div className="gp-st off"><b>Ingresso já {gift ? "recebido" : "aceito"}</b><span>Este ingresso já está em outra conta.</span></div>
          ) : mine ? (
            <div className="gp-st ok"><b>O ingresso é seu</b><span>Ele já está em Meus ingressos.</span></div>
          ) : null}
          {mine ? (
            <div className="gp-foot"><Link href={`/ingressos/${t.code}`}>Abrir o ingresso</Link></div>
          ) : tr.status === "pending" && (user ? (
            <AcceptTransfer token={token} email={user.email ?? ""} expected={tr.toEmail} gift={gift} />
          ) : (
            <div className="gp-foot">
              <Link className="gp-pay" href={`/entrar?next=${encodeURIComponent(next)}`}>{gift ? "Entrar para receber" : "Entrar para aceitar"}</Link>
              <Link href={`/cadastro?next=${encodeURIComponent(next)}${gift ? `&email=${encodeURIComponent(tr.toEmail)}` : ""}`}>Criar conta grátis</Link>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
