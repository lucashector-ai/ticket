"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { brl } from "@/lib/format";
import { Feed, type FeedRow } from "./home";
import { PainelLancamento, type LaunchProps } from "./lancamento";
import { useOrigin } from "./use-origin";

type Tab = "geral" | "participantes" | "checkin" | "financeiro" | "lancamento";
type Person = { id: string; name: string; ini: string; bg: string; email: string; ticket: string; meia: boolean; order: string; date: string; status: string; inAt: string | null };

export type EventoPainelProps = {
  tab: Tab;
  ev: { id: string; slug: string; title: string; flyerId: string; when: string; where: string; status: string; stCls: string; countdown: string; draft: boolean; absorbFee: boolean };
  kpis: { net: string; gross: string; sold: number; cap: number; pct: number; orders: number; avg: string; tix: number };
  chart: { revenue: number[]; tickets: number[]; labels: string[] };
  tiers: { id: string; name: string; sub: string; color: string; price: string; sold: number; total: number; pct: number; revenue: string; status: string; stCls: string }[];
  feed: FeedRow[];
  methods: { name: string; pct: number; value: string }[];
  coupons: { code: string; uses: number; off: string; label: string }[];
  people: Person[];
  checkin: { total: number; inside: number; perMin: string; sectors: { name: string; n: number; total: number; pct: number }[]; last: { id: string; name: string; what: string; at: string }[] };
  fin: { gross: string; buyerFees: string; platform: string; net: string; refunds: { id: string; name: string; value: string; when: string }[]; refundPct: string };
  launch?: LaunchProps;
};

const n = (v: number) => v.toLocaleString("pt-BR");

export function PainelEvento(p: EventoPainelProps) {
  const { flash } = useToast();
  const [tab, setTab] = useState<Tab>(p.tab);
  const [more, setMore] = useState(false);
  const url = `${useOrigin()}/eventos/${p.ev.slug}`;
  const pick = (t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "geral") u.searchParams.delete("aba"); else u.searchParams.set("aba", t);
    window.history.replaceState(null, "", u.toString());
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash("Link copiado."); } catch { flash("Não foi possível copiar."); } };
  const TABS: [Tab, string, number][] = [["geral", "Visão geral", 0], ["participantes", "Participantes", p.people.length], ["checkin", "Check-in", 0], ["financeiro", "Financeiro", p.fin.refunds.length], ["lancamento", "Lançamento", p.launch?.signups.length ?? 0]];

  return (
    <div className="pane">
      <nav className="crumb3" aria-label="Você está em"><Link className="cr-b" href="/painel">Eventos</Link><span aria-hidden="true">›</span><span className="cr-c">{p.ev.title}</span></nav>
      <section className="eh">
        <div className="eh-art"><FlyerArt id={p.ev.flyerId} /></div>
        <div className="eh-i">
          <div className="eh-r"><h1 className="eh-t">{p.ev.title}</h1><span className={p.ev.stCls}><i />{p.ev.status}</span>{p.ev.countdown && <span className="cd2">{p.ev.countdown}</span>}</div>
          <span className="eh-s">{p.ev.when} · {p.ev.where}</span>
          <div className="eh-link"><span className="lk-v">{url.replace(/^https?:\/\//, "")}</span><button className="lk-b" type="button" onClick={() => void copy()}>Copiar link</button></div>
        </div>
        <div className="eh-a">
          <Link className="b2" href={`/eventos/${p.ev.slug}`} target="_blank">Ver página</Link>
          <Link className="b2 dark" href={`/criar-evento?editar=${p.ev.id}`}>Editar evento</Link>
          <button className="b2 icon" type="button" onClick={() => setMore((v) => !v)} aria-label="Mais ações" aria-expanded={more}>•••</button>
          {more && (
            <div className="menu">
              <button className="mn-i" type="button" onClick={() => { setMore(false); exportCsv(p.ev.title, p.people); }}>Exportar participantes (CSV)</button>
              <button className="mn-i" type="button" onClick={() => { setMore(false); pick("financeiro"); }}>Ver financeiro</button>
              <Link className="mn-i" href={`/criar-evento?editar=${p.ev.id}`}>Gerenciar lotes e cupons</Link>
            </div>
          )}
        </div>
      </section>
      {p.ev.draft && <div className="warn2"><b className="wr-t">Rascunho.</b><span className="wr-s">Ninguém vê este evento ainda. Publique para começar a vender.</span><Link className="b2" href={`/criar-evento?editar=${p.ev.id}`}>Continuar</Link></div>}

      <nav className="etabs" aria-label="Seções do evento">
        {TABS.map(([k, l, c]) => <button key={k} className={tab === k ? "et on" : "et"} type="button" onClick={() => pick(k)} aria-current={tab === k ? "page" : undefined}>{l}{c ? <span className="tb-n2">{n(c)}</span> : null}</button>)}
      </nav>

      {tab === "geral" && <Geral p={p} />}
      {tab === "participantes" && <People p={p} />}
      {tab === "checkin" && <Checkin p={p} />}
      {tab === "financeiro" && <Fin p={p} />}
      {tab === "lancamento" && p.launch && <PainelLancamento p={p.launch} />}
    </div>
  );
}

function Geral({ p }: { p: EventoPainelProps }) {
  const k = p.kpis;
  const dash = ((Math.min(100, k.pct) / 100) * 113.1).toFixed(1);
  return (
    <div className="pane2">
      <div className="kpis">
        <div className="kpi"><span className="kp-l">Receita líquida</span><b className="kp-v">{k.net}</b><div className="kp-f"><span className="kp-n">vendido {k.gross}</span></div></div>
        <div className="kpi kring">
          <svg className="rg" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#EDEDEA" strokeWidth="5" />{k.pct > 0 && <circle cx="22" cy="22" r="18" fill="none" stroke="#111111" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} 113.1`} transform="rotate(-90 22 22)" />}</svg>
          <div><span className="kp-l">Ingressos vendidos</span><b className="kp-v">{n(k.sold)}</b><div className="kp-f"><span className="kp-n">{k.cap ? `de ${n(k.cap)} · ${k.pct}%` : "sem limite definido"}</span></div></div>
        </div>
        <div className="kpi"><span className="kp-l">Pedidos pagos</span><b className="kp-v">{n(k.orders)}</b><div className="kp-f"><span className="kp-n">{n(k.tix)} ingressos</span></div></div>
        <div className="kpi"><span className="kp-l">Ticket médio</span><b className="kp-v">{k.avg}</b><div className="kp-f"><span className="kp-n">líquido por ingresso</span></div></div>
      </div>

      <div className="cols">
        <div className="maincol">
          <Chart c={p.chart} />
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Ingressos por setor</h2><span className="card-s">Lotes, vendas e receita de cada tipo</span></div><Link className="b2" href={`/criar-evento?editar=${p.ev.id}`}>Gerenciar lotes</Link></div>
            <div className="tbl">
              <div className="tr2 thd"><span>Tipo</span><span>Preço</span><span>Vendidos</span><span className="num">Receita</span><span /></div>
              {p.tiers.map((t) => (
                <div className="tr2" key={t.id}>
                  <span className="tt"><i className="tt-sw" style={{ background: t.color }} /><span className="tt-i"><b className="tt-n">{t.name}</b>{t.sub && <span className="tt-s">{t.sub}</span>}</span></span>
                  <span className="tt-p">{t.price}</span>
                  <span className="tt-q"><span className="bar sm"><i style={{ width: `${t.pct}%` }} /></span><span className="tt-qv">{n(t.sold)} / {n(t.total)}</span></span>
                  <span className="num tt-r">{t.revenue}</span>
                  <span className={t.stCls}>{t.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="side2">
          <section className="cx live">
            <div className="card-h"><h2 className="card-t">Vendas ao vivo</h2><span className="live-d"><i />Ao vivo</span></div>
            {p.feed.length ? p.feed.map((f) => <Feed key={f.id} f={f} withEvent={false} />) : <span className="card-s">Nenhuma venda ainda.</span>}
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Formas de pagamento</h2></div>
            {p.methods.length ? p.methods.map((m) => <div className="src2" key={m.name}><span className="sr-n">{m.name}</span><span className="bar"><i style={{ width: `${m.pct}%` }} /></span><b className="sr-v">{m.pct}%</b></div>) : <span className="card-s">Sem vendas ainda.</span>}
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Cupons</h2><span className="card-s">{p.coupons.reduce((s, c) => s + c.uses, 0)} usos</span></div>
            {p.coupons.length ? p.coupons.map((c) => <div className="cpr" key={c.code}><span className="cp-c">{c.code}</span><span className="cp-u">{c.label} · {c.uses} {c.uses === 1 ? "uso" : "usos"}</span><b className="cp-v">−{c.off}</b></div>) : <span className="card-s">Nenhum cupom criado.</span>}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Vendas por dia (30 dias), em receita ou ingressos; clique numa barra para ver o valor. */
function Chart({ c }: { c: EventoPainelProps["chart"] }) {
  const [mode, setMode] = useState<"receita" | "ingressos">("receita");
  const vals = mode === "receita" ? c.revenue : c.tickets;
  const [sel, setSel] = useState(vals.length - 1);
  const X0 = 46, SL = (716 - X0) / vals.length, BW = 14, BASE = 190, TOP = 40;
  const top = Math.max(...vals, mode === "receita" ? 10000 : 10);
  const mag = 10 ** Math.floor(Math.log10(top)), max = Math.ceil(top / mag) * mag;
  const bars = vals.map((v, i) => { const h = Math.max(v ? 3 : 1.5, (v / max) * (BASE - TOP)); return { x: X0 + i * SL + (SL - BW) / 2, y: BASE - h, h }; });
  const fmt = (v: number) => (mode === "receita" ? (v >= 100000 ? `${Math.round(v / 100000)} mil` : brl(v).replace(",00", "")) : n(Math.round(v)));
  const grid = [0, 1, 2, 3].map((g) => ({ y: BASE - (g / 3) * (BASE - TOP), v: (max / 3) * g }));
  const b = bars[sel];
  const total = vals.reduce((s, v) => s + v, 0);
  return (
    <section className="cx">
      <div className="card-h">
        <div><h2 className="card-t">Vendas por dia</h2><span className="card-s">Últimos 30 dias · {mode === "receita" ? `${brl(total)} líquidos` : `${n(total)} ingressos`}</span></div>
        <div className="seg2 sm">{(["receita", "ingressos"] as const).map((m) => <button key={m} className={mode === m ? "sg on" : "sg"} type="button" onClick={() => setMode(m)}>{m === "receita" ? "Receita" : "Ingressos"}</button>)}</div>
      </div>
      <div className="chart">
        <svg viewBox="0 0 720 220" className="ch-svg" role="img" aria-label="Gráfico de vendas por dia nos últimos 30 dias">
          <g className="ch-grid">{grid.map((g) => <line key={g.y} x1="40" x2="716" y1={g.y} y2={g.y} />)}</g>
          {bars.map((r, i) => <rect key={i} className={i === sel ? "bx on" : "bx"} x={r.x.toFixed(1)} y={r.y.toFixed(1)} width={BW} height={r.h.toFixed(1)} rx="4" onClick={() => setSel(i)} />)}
        </svg>
        {grid.map((g) => <span key={g.y} className="ch-yl" style={{ top: `${(g.y / 220) * 100}%` }}>{g.v ? fmt(g.v) : "0"}</span>)}
        {[0, 7, 14, 21, vals.length - 1].map((i) => <span key={i} className="ch-xl" style={{ left: `${((X0 + i * SL + SL / 2) / 720) * 100}%` }}>{c.labels[i]}</span>)}
        <div className="tip" style={{ left: `${((b.x + BW / 2) / 720) * 100}%`, top: `${(b.y / 220) * 100}%` }}>
          <b className="tp-v">{mode === "receita" ? brl(vals[sel]) : `${n(vals[sel])} ${vals[sel] === 1 ? "ingresso" : "ingressos"}`}</b>
          <span className="tp-s">{c.labels[sel]}{sel === vals.length - 1 ? " · hoje" : ""}</span>
        </div>
      </div>
    </section>
  );
}

function People({ p }: { p: EventoPainelProps }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "meia" | "in" | "wait">("all");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const live = p.people.filter((x) => x.status === "valid" || x.status === "used");
  const list = useMemo(() => {
    const nq = norm(q.trim());
    return p.people.filter((x) =>
      (f === "all" || (f === "meia" ? x.meia : f === "in" ? !!x.inAt : !x.inAt && (x.status === "valid"))) &&
      (!nq || norm(`${x.name} ${x.email} ${x.order}`).includes(nq)));
  }, [p.people, q, f]);
  const FIL: [typeof f, string, number][] = [["all", "Todos", p.people.length], ["meia", "Meia", p.people.filter((x) => x.meia).length], ["in", "Entraram", live.filter((x) => x.inAt).length], ["wait", "Aguardando", live.filter((x) => !x.inAt && x.status === "valid").length]];
  const shown = list.slice(0, 300);
  return (
    <div className="pane2">
      <section className="cx">
        <div className="card-h wrap2">
          <label className="pd-search in-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou pedido" aria-label="Buscar participante" />
          </label>
          <div className="chips3">{FIL.map(([k, l, c]) => <button key={k} className={f === k ? "chp on" : "chp"} type="button" onClick={() => setF(k)}>{l} <span className="sg-n">{n(c)}</span></button>)}</div>
          <div className="ca"><button className="b2" type="button" onClick={() => exportCsv(p.ev.title, list)}>Exportar CSV</button></div>
        </div>
        <div className="tbl">
          <div className="tr3 thd"><span>Participante</span><span>Ingresso</span><span>Pedido</span><span>Compra</span><span>Check-in</span></div>
          {shown.map((x) => (
            <div className="tr3" key={x.id}>
              <span className="pp"><span className="pp-av" style={{ background: x.bg }}>{x.ini}</span><span className="pp-i"><b className="pp-n">{x.name}</b><span className="pp-e">{x.email}</span></span></span>
              <span className="pp-t">{x.ticket}{x.meia && <span className="mtag">Meia</span>}</span>
              <span className="pp-o">{x.order}</span>
              <span className="pp-d">{x.date}</span>
              <span className={x.inAt ? "st on" : x.status === "valid" ? "st draft" : "st end"}>{x.inAt ? `Entrou ${x.inAt}` : x.status === "valid" ? "Aguardando" : x.status === "transferred" ? "Transferido" : x.status === "refunded" ? "Reembolsado" : "Cancelado"}</span>
            </div>
          ))}
          {list.length === 0 && <div className="empty2"><b className="em-t">{p.people.length ? "Ninguém encontrado" : "Nenhum participante ainda"}</b><span className="em-s">{p.people.length ? "Tente outro nome, e-mail ou número de pedido." : "Os ingressos vendidos aparecem aqui."}</span></div>}
        </div>
        <span className="tbl-f">Mostrando {n(shown.length)} de {n(list.length)} participantes</span>
      </section>
    </div>
  );
}

function Checkin({ p }: { p: EventoPainelProps }) {
  const c = p.checkin;
  const pct = c.total ? Math.round((c.inside / c.total) * 100) : 0;
  return (
    <div className="pane2">
      <div className="ci">
        <section className="cx ci-big">
          <span className="ci-k">Entrada no evento</span>
          <div className="ci-ring">
            <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="84" fill="none" stroke="#EDEDEA" strokeWidth="16" />{pct > 0 && <circle cx="100" cy="100" r="84" fill="none" stroke="#D3F55B" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${((pct / 100) * 528).toFixed(1)} 528`} transform="rotate(-90 100 100)" />}</svg>
            <div className="ci-c"><b className="ci-v">{n(c.inside)}</b><span className="ci-s">de {n(c.total)}</span></div>
          </div>
          <div className="ci-row"><div><b className="cr-v">{pct}%</b><span className="cr-k">entraram</span></div><div><b className="cr-v">{n(c.total - c.inside)}</b><span className="cr-k">faltam</span></div><div><b className="cr-v">{c.perMin}</b><span className="cr-k">por minuto</span></div></div>
          <span className="ci-note">{p.ev.countdown ? `${p.ev.countdown} para o evento. ` : ""}Atualize a página para ver as entradas mais recentes.</span>
        </section>
        <div className="ci-r">
          <section className="cx scan">
            <div className="sc-qr" aria-hidden="true"><span className="sc-c c1" /><span className="sc-c c2" /><span className="sc-c c3" /><span className="sc-c c4" /><span className="sc-line" /></div>
            <div className="sc-i"><b className="card-t">Leitura dos QR codes</b><span className="card-s">Cada ingresso tem um QR code assinado, que só vale uma vez. O app de portaria para a sua equipe ler pelo celular chega na próxima fase.</span></div>
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Por setor</h2></div>
            {c.sectors.length ? c.sectors.map((s) => <div className="src2" key={s.name}><span className="sr-n">{s.name}</span><span className="bar"><i style={{ width: `${s.pct}%` }} /></span><b className="sr-v">{n(s.n)}/{n(s.total)}</b></div>) : <span className="card-s">Sem ingressos emitidos ainda.</span>}
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Últimas leituras</h2></div>
            {c.last.length ? c.last.map((s) => <div className="fd" key={s.id}><span className="sdot" aria-hidden="true" /><div className="fd-i"><b className="fd-n">{s.name}</b><span className="fd-s">{s.what}</span></div><span className="fd-s">{s.at}</span></div>) : <span className="card-s">Nenhuma leitura ainda.</span>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Fin({ p }: { p: EventoPainelProps }) {
  const f = p.fin;
  return (
    <div className="pane2">
      <div className="fin">
        <div className="fl"><span className="fl-k">Vendido em ingressos</span><b className="fl-v">{f.gross}</b></div>
        <span className="fl-op" aria-hidden="true">−</span>
        <div className="fl"><span className="fl-k">{p.ev.absorbFee ? "Taxa Tickets Win (10%, absorvida por você)" : "Taxa Tickets Win (paga pelo comprador)"}</span><b className="fl-v">{p.ev.absorbFee ? f.platform : brl(0)}</b></div>
        <span className="fl-op" aria-hidden="true">=</span>
        <div className="fl hl"><span className="fl-k">Seu líquido</span><b className="fl-v">{f.net}</b></div>
      </div>
      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Repasses</h2><span className="card-s">{p.ev.absorbFee ? "" : `Os compradores pagaram ${f.buyerFees} de taxa de serviço, à parte. `}Vendas de teste não geram repasse.</span></div></div>
            <div className="bal"><div><span className="bl-k">Líquido das vendas</span><b className="bl-v">{f.net}</b></div><div><span className="bl-k">Reembolsado</span><b className="bl-v">{f.refundPct}%</b></div></div>
            <p className="card-s" style={{ marginTop: 16 }}>Os repasses automáticos para a sua conta (D+2 após cada venda aprovada) começam quando o pagamento real com Pix e cartão for ligado. Até lá, este painel mostra o que cada venda vai render.</p>
          </section>
        </div>
        <aside className="side2">
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Reembolsos</h2><span className="card-s">{f.refunds.length}</span></div>
            {f.refunds.length ? f.refunds.map((r) => <div className="rf" key={r.id}><div className="rf-i"><b className="rf-n">{r.name} · {r.value}</b><span className="rf-s">Reembolsado {r.when}</span></div></div>) : <span className="card-s">Nenhum reembolso.</span>}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Lista de participantes em CSV (abre no Excel/Planilhas). */
function exportCsv(title: string, rows: Person[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [["Nome", "E-mail", "Ingresso", "Meia", "Pedido", "Compra", "Check-in"], ...rows.map((r) => [r.name, r.email, r.ticket, r.meia ? "sim" : "não", r.order, r.date, r.inAt ?? ""])];
  const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `participantes-${title.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
