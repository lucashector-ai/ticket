import type { Metadata } from "next";
import Link from "next/link";
import { FlyerArt } from "@/components/art/flyer";
import { ContaShell } from "@/components/conta/shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { contaUser, listOrders } from "@/lib/data/conta";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minhas compras", robots: { index: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pago", cls: "ok" }, pending: { label: "Aguardando pagamento", cls: "warn" }, cancelled: { label: "Cancelado", cls: "" },
  refunded: { label: "Reembolsado", cls: "" }, expired: { label: "Expirado", cls: "" },
};
const METHOD: Record<string, string> = { pix: "Pix", card: "Cartão", free: "Grátis", test: "Teste" };
const day = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).replace(".", "");

export default async function ComprasPage() {
  const { user, profile } = await contaUser("/conta/compras");
  const orders = await listOrders(user.id);
  const now = new Date();
  const paid = orders.filter((o) => o.status === "paid");
  const spent = paid.reduce((s, o) => s + o.totalCents, 0);
  return (
    <div className="pg-conta">
      <SiteHeader user={user} variant="default" activePath="/conta" />
      <ContaShell name={profile?.name || user.name || ""} email={user.email} avatar={profile?.avatarUrl ?? user.image ?? null} mfa={!!profile?.mfaMethod}>
        <header className="ct-head">
          <h1 className="ct-t">Minhas compras</h1>
          <p className="ct-s">{paid.length ? `${paid.length} ${paid.length === 1 ? "pedido pago" : "pedidos pagos"} · ${brl(spent)} no total` : "Seus pedidos aparecem aqui, com recibo e status do pagamento."}</p>
        </header>
        {orders.length ? (
          <ul className="ct-orders">
            {orders.map((o) => {
              const pendingExpired = o.status === "pending" && !!o.expiresAt && o.expiresAt < now;
              const st = STATUS[pendingExpired ? "expired" : o.status] ?? STATUS.cancelled;
              const qty = o.items.reduce((s, i) => s + i.quantity, 0);
              const where = [o.event.venueNameOverride ?? o.event.venue?.name, o.event.venue?.city.name].filter(Boolean).join(" · ");
              return (
                <li key={o.id} className="ct-order">
                  <span className="ct-o-art" aria-hidden="true"><FlyerArt id={o.event.flyerId} /></span>
                  <span className="ct-o-t">
                    <span className={`ct-pill ${st.cls}`}>{st.label}</span>
                    <b>{o.event.title}</b>
                    <small>{day(o.event.startAt)}{where ? ` · ${where}` : ""}</small>
                    <small>Pedido nº {o.number} · {day(o.createdAt)} · {qty} {qty === 1 ? "ingresso" : "ingressos"}{o.paymentMethod ? ` · ${METHOD[o.paymentMethod] ?? ""}` : ""}</small>
                  </span>
                  <span className="ct-o-r">
                    <b>{o.totalCents ? brl(o.totalCents) : "Grátis"}</b>
                    <span className="ct-o-a">
                      {o.status === "paid" && <Link className="ct-b sm" href="/meus-ingressos">Ingressos</Link>}
                      <Link className="ct-b sm ghost" href={`/checkout/${o.id}`}>{o.status === "pending" && !pendingExpired ? "Pagar" : "Detalhes"}</Link>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="ct-card ct-none">
            <b>Nenhuma compra ainda</b>
            <p>Quando você comprar um ingresso, o pedido aparece aqui.</p>
            <Link className="ct-b dark" href="/explorar">Explorar eventos</Link>
          </div>
        )}
      </ContaShell>
      <SiteFooter />
    </div>
  );
}
