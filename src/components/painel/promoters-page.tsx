"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PainelPromoters, type PromotersProps } from "./promoters";

export type PromotersPageProps = {
  hasOrg: boolean;
  events: { id: string; title: string; when: string; past: boolean }[];
  eventId: string;
  kpis: { revenue: string; tickets: number; orders: number; commission: string; clicks: number; conv: string; active: number };
  list: PromotersProps;
};

const n = (v: number) => v.toLocaleString("pt-BR");

/** Página de promoters: quem vende os seus ingressos, por evento. */
export function PainelPromotersPage(p: PromotersPageProps) {
  const router = useRouter();
  const pick = (id: string) => router.push(id ? `/painel/promoters?evento=${id}` : "/painel/promoters");
  return (
    <div className="pane">
      <div className="pg-h pm-h">
        <div><h1 className="pg-t">Promoters</h1><p className="pg-s">Quem está vendendo ingressos dos seus eventos, quanto vendeu e quanto ganha de comissão</p></div>
        <label className="fld pm-ev"><span>Evento</span>
          <select value={p.eventId} onChange={(e) => pick(e.target.value)} disabled={!p.events.length}>
            {p.events.length ? <option value="">Todos os eventos</option> : <option value="">Nenhum evento publicado ainda</option>}
            {p.events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}{e.past ? " (encerrado)" : ""}</option>)}
          </select>
        </label>
      </div>

      {!p.events.length ? (
        <section className="cx"><div className="empty2 big pm-empty">
          <b className="em-t">Ainda não há dados de vendas</b>
          <span className="em-s">Assim que seus primeiros ingressos estiverem à venda, as vendas dos seus promoters aparecem aqui.</span>
          <Link className="b2 dark" href={p.hasOrg ? "/criar-evento" : "/produtores/cadastro"}>Criar um evento</Link>
        </div></section>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="kp-l">Vendido por promoters</span><b className="kp-v">{p.kpis.revenue}</b><div className="kp-f"><span className="kp-n">{n(p.kpis.tickets)} {p.kpis.tickets === 1 ? "ingresso" : "ingressos"} em {n(p.kpis.orders)} {p.kpis.orders === 1 ? "pedido" : "pedidos"}</span></div></div>
            <div className="kpi"><span className="kp-l">Comissão a pagar</span><b className="kp-v">{p.kpis.commission}</b><div className="kp-f"><span className="kp-n">sobre o valor dos ingressos</span></div></div>
            <div className="kpi"><span className="kp-l">Cliques nos links</span><b className="kp-v">{n(p.kpis.clicks)}</b><div className="kp-f"><span className="kp-n">{p.kpis.conv} viraram compra</span></div></div>
            <div className="kpi"><span className="kp-l">Promoters ativos</span><b className="kp-v">{n(p.kpis.active)}</b><div className="kp-f"><span className="kp-n">de {n(p.list.rows.length)} cadastrados</span></div></div>
          </div>
          {p.hasOrg ? <PainelPromoters p={p.list} ranked /> : (
            <section className="cx"><div className="empty2"><b className="em-t">Termine o seu cadastro de produtor</b><span className="em-s">Os links de promoter ficam ligados à sua página de produtor.</span><Link className="b2 dark" href="/produtores/cadastro">Fazer cadastro</Link></div></section>
          )}
          <section className="cx pm-how">
            <div className="card-h"><h2 className="card-t">Como funciona</h2></div>
            <ol className="pm-steps">
              <li><b>Crie um link para cada promoter</b><span>Pode ser para um evento ou para todos. Você define a comissão.</span></li>
              <li><b>O promoter divulga</b><span>Quem compra pelo link em até 30 dias conta para ele, mesmo voltando depois.</span></li>
              <li><b>Acompanhe e pague</b><span>Cada promoter tem uma página própria para ver as vendas, sem acesso ao seu painel.</span></li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
