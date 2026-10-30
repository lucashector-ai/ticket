import type { Metadata } from "next";
import Link from "next/link";
import { orderSums, totalsOf } from "@/lib/data/painel";
import { painelAccess } from "@/lib/painel/access";
import { brl } from "@/lib/format";
import { ended, nowMs } from "@/lib/painel/build";
import { BancoCard } from "@/components/painel/banco-card";
import { bankCredential, bankUrl, destLabel, hasDestination, RELEASE_DAYS, walletFor } from "@/lib/bank";
import { mfaSettings } from "@/lib/mfa";
import { Tbl } from "@/components/painel/tbl";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Financeiro" };

/** eventos por página na tabela "Por evento" */
const PER_PAGE = 25;

/** Financeiro de todos os eventos do produtor (somado no banco; a tabela por evento é paginada). */
export default async function PainelFinanceiro({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { org, events, role, user } = await painelAccess("admin");
  const [wallet, cred, mfa] = role === "owner" ? await Promise.all([walletFor(user.id), bankCredential(user.id), mfaSettings(user.id)]) : [null, null, null];
  const dm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  // somas por evento, dia e valor feitas no banco: produtor grande não traz dezenas de milhares de pedidos
  const sums = await orderSums(events.map((e) => e.id));
  const absorb = new Map(events.map((e) => [e.id, e.absorbFee]));
  const now = nowMs();
  const year = String(new Date(now).getFullYear());
  const paid = sums.filter((s) => s.status === "paid");
  const tot = (l: typeof sums) => {
    const byEv = new Map<string, typeof sums>();
    for (const s of l) byEv.set(s.eventId, [...(byEv.get(s.eventId) ?? []), s]);
    return [...byEv].reduce((t, [id, rs]) => { const x = totalsOf(rs, absorb.get(id) ?? false); return { gross: t.gross + x.gross, net: t.net + x.net, qty: t.qty + x.qty, orders: t.orders + x.orders }; }, { gross: 0, net: 0, qty: 0, orders: 0 });
  };
  const future = new Set(events.filter((e) => !ended(e, now)).map((e) => e.id));
  const published = events.filter((e) => e.status !== "draft");
  const all = tot(paid), refunded = tot(sums.filter((s) => s.status === "refunded"));
  const kpis = [
    { l: "Líquido das vendas", v: brl(all.net), n: `${published.length} eventos` },
    { l: "Em eventos futuros", v: brl(tot(paid.filter((s) => future.has(s.eventId))).net), n: `${future.size} ${future.size === 1 ? "evento" : "eventos"}` },
    { l: `Vendido em ${year}`, v: brl(tot(paid.filter((s) => s.day.startsWith(year))).gross), n: "em ingressos" },
    { l: "Reembolsos", v: `${all.gross + refunded.gross ? ((refunded.gross / (all.gross + refunded.gross)) * 100).toFixed(1).replace(".", ",") : "0"}%`, n: `${refunded.orders} ${refunded.orders === 1 ? "pedido" : "pedidos"}` },
  ];
  const pages = Math.max(1, Math.ceil(published.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt((await searchParams).p ?? "1", 10) || 1));
  const rows = published.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((e) => {
    const x = totalsOf(paid.filter((s) => s.eventId === e.id), e.absorbFee);
    return { id: e.id, title: e.title, gross: x.gross, fee: x.gross - x.net, net: x.net, n: x.qty };
  });
  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">Financeiro</h1><p className="pg-s">Todos os eventos de {org?.name ? <b>{org.name}</b> : "você"}</p></div></div>
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
        {pages > 1 && (
          <nav className="pgn" aria-label="Páginas da tabela por evento">
            <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, published.length)} de {published.length} eventos</span>
            {page > 1 && <Link className="b2" href={`/painel/financeiro?p=${page - 1}`} scroll={false}>Anteriores</Link>}
            {page < pages && <Link className="b2" href={`/painel/financeiro?p=${page + 1}`} scroll={false}>Próximos</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
