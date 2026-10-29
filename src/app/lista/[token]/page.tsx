import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import { FlyerArt } from "@/components/art/flyer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { companionsLabel, guestQrPayload } from "@/lib/guest-list";
import { eventLabels } from "@/lib/tickets/labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ingresso de lista", robots: { index: false, follow: false } };

const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);

/** Ingresso de lista (lista free): o QR de entrada gratuita deste nome. Não tem pedido nem linha em tickets: não revende, não transfere, não conta como venda. */
export default async function ListaFreePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) notFound();
  const g = await db.query.guestListEntries.findFirst({
    where: eq(schema.guestListEntries.token, token),
    with: { event: { with: { venue: { with: { city: true } } } } },
  });
  if (!g || g.event.status === "draft") notFound();
  const user = await getSessionUser();
  const L = eventLabels(g.event);
  const svg = await QRCode.toString(guestQrPayload(g.token), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffff00" } });
  const plus = companionsLabel(g.guests);
  const over = g.event.status === "cancelled";

  return (
    <div className="pg-grupo">
      <SiteHeader user={user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null} variant="default" />
      <main className="wrap gp">
        <section className="gp-card lf-inv">
          <div className="gp-ev">
            <div className="gp-art"><FlyerArt id={g.event.flyerId} /></div>
            <div className="gp-ei">
              <span className="gp-k">Lista free · Cortesia</span>
              <h1 className="gp-t">{g.event.title}</h1>
              <span className="gp-d">{L.dateNice}{L.venue ? ` · ${L.venue}` : ""}</span>
            </div>
          </div>
          <div className="lf-pass">
            <div className={g.checkedInAt || over ? "lf-qr used" : "lf-qr"} aria-label="QR code do ingresso de lista" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="lf-who">
              <span className="lf-tag">Ingresso de lista · Entrada gratuita</span>
              <b>{g.name}</b>
              {plus && <span>{plus}</span>}
            </div>
          </div>
          {over ? (
            <div className="gp-st off"><b>Evento cancelado</b><span>O produtor cancelou este evento. O ingresso de lista não vale mais.</span></div>
          ) : g.checkedInAt ? (
            <div className="gp-st ok"><b>Entrada registrada às {hm(g.checkedInAt)}</b><span>Este ingresso de lista já foi usado na portaria.</span></div>
          ) : (
            <div className="gp-st"><b>Mostre este QR code na portaria</b><span>Ou diga o seu nome: ele está na lista. A conferência de documento fica a critério do local.</span></div>
          )}
          <p className="lf-fine">Vale uma entrada{plus ? " (com os acompanhantes)" : ""} e é só para este nome: não pode ser vendido nem transferido.</p>
          <div className="gp-foot"><Link href={`/eventos/${g.event.slug}`}>Ver o evento</Link></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
