import type { Metadata } from "next";
import Link from "next/link";
import { listOrders } from "@/lib/data/painel";
import { painelAccess } from "@/lib/painel/access";
import { brl } from "@/lib/format";
import { ended, nowMs } from "@/lib/painel/build";
import { BancoCard } from "@/components/painel/banco-card";
import { bankCredential, bankUrl, destLabel, hasDestination, RELEASE_DAYS, walletFor } from "@/lib/bank";
import { mfaSettings } from "@/lib/mfa";
import { Tbl } from "@/components/painel/tbl";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financeiro" };

/** Financeiro de todos os eventos do produtor. */
export default async function PainelFinanceiro() {
  const { org, events, role, user } = await painelAccess("admin");
  const [wallet, cred, mfa] = role === "owner" ? await Promise.all([walletFor(user.id), bankCredential(user.id), mfaSettings(user.id)]) : [null, null, null];
  const dm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  const orders = await listOrders(events.map((e) => e.id), new Map(events.map((e) => [e.id, e.absorbFee])));
  const now = nowMs();
  const year = new Date(now).getFullYear();
  const paid = orders.filter((o) => o.status === "paid");
  const refunded = orders.filter((o) => o.status === "refunded");
  const sum = (l: typeof orders, f: (o: (typeof orders)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
  const future = new Set(events.filter((e) => !ended(e, now)).map((e) => e.id));
  const rows = events.filter((e) => e.status !== "draft").map((e) => {
    const mine = paid.filter((o) => o.eventId === e.id);
    return { id: e.id, title: e.title, gross: sum(mine, (o) => o.revenue), fee: sum(mine, (o) => o.revenue - o.net), net: sum(mine, (o) => o.net), n: sum(mine, (o) => o.qty), future: future.has(e.id) };
  });
  const grossAll = sum(paid, (o) => o.revenue), refAll = sum(refunded, (o) => o.revenue);
  const kpis = [
    { l: "Líquido das vendas", v: brl(sum(paid, (o) => o.net)), n: `${events.filter((e) => e.status !== "draft").length} eventos` },
    { l: "Em eventos futuros", v: brl(sum(paid.filter((o) => future.has(o.eventId)), (o) => o.net)), n: `${future.size} ${future.size === 1 ? "evento" : "eventos"}` },
    { l: `Vendido em ${year}`, v: brl(sum(paid.filter((o) => o.at.getFullYear() === year), (o) => o.revenue)), n: "em ingressos" },
    { l: "Reembolsos", v: `${grossAll + refAll ? ((refAll / (grossAll + refAll)) * 100).toFixed(1).replace(".", ",") : "0"}%`, n: `${refunded.length} ${refunded.length === 1 ? "pedido" : "pedidos"}` },
  ];
  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">Financeiro</h1><p className="pg-s">Todos os eventos de {org?.name ?? "você"}</p></div></div>
      {wallet && (
        <BancoCard
          url={bankUrl()} hasPassword={!!cred} hasApp={mfa?.method === "totp"} releaseDays={RELEASE_DAYS}
          available={wallet.available < 0 ? `−${brl(-wallet.available)}` : brl(wallet.available)} pending={brl(wallet.pending)} inFlight={brl(wallet.inFlight)} paidOut={brl(wallet.paidOut)}
          nextRelease={wallet.nextRelease ? dm(wallet.nextRelease) : null}
          destination={hasDestination(wallet.destination) ? destLabel(wallet.destination) : null}
          payouts={wallet.payouts.slice(0, 5).map((x) => ({ id: x.id, at: dm(x.createdAt.toISOString()), amount: brl(x.amountCents), status: x.status }))}
        />
      )}
      <div className="kpis">
        {kpis.map((k) => <div className="kpi" key={k.l}><span className="kp-l">{k.l}</span><b className="kp-v">{k.v}</b><div className="kp-f"><span className="kp-n">{k.n}</span></div></div>)}
      </div>
      <section className="cx">
        <div className="card-h"><div><h2 className="card-t">Por evento</h2><span className="card-s">O líquido de cada evento entra no Banco Tickets Win e fica disponível {RELEASE_DAYS} dias depois do evento. Vendas de teste não geram repasse.</span></div></div>
        <Tbl label="Vendas por evento">
          <div className="tr4 thd"><span>Evento</span><span className="num">Vendido</span><span className="num">Taxa</span><span className="num">Ingressos</span><span className="num">Líquido</span></div>
          {rows.map((r) => (
            <div className="tr4" key={r.id}>
              <Link className="tt-n" href={`/painel/evento/${r.id}?aba=financeiro`}>{r.title}</Link>
              <span className="num">{brl(r.gross)}</span><span className="num">{r.fee ? brl(r.fee) : "—"}</span><span className="num">{r.n.toLocaleString("pt-BR")}</span><b className="num">{brl(r.net)}</b>
            </div>
          ))}
          {rows.length === 0 && <div className="empty2"><b className="em-t">Nenhum evento publicado</b><span className="em-s">Quando você vender, os valores aparecem aqui.</span></div>}
        </Tbl>
      </section>
    </div>
  );
}
