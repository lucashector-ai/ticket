"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent } from "@/lib/actions/eventos";
import { PainelPortal } from "./emails/portal";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { brl } from "@/lib/format";
import { Feed, type FeedRow } from "./home";
import { PainelLancamento, type LaunchProps } from "./lancamento";
import { PainelRevenda, type RevendaProps } from "./revenda";
import { PainelLista, type ListaProps } from "./lista";
import { PainelReembolsos } from "./reembolsos";
import type { RefundTab } from "@/lib/data/reembolsos";
import { CheckinLinks, type CheckinLink } from "./checkin-links";
import { useOrigin } from "./use-origin";
import { csvBlob } from "@/lib/csv";
import { Tbl } from "@/components/painel/tbl";

type Tab = "geral" | "participantes" | "lista" | "checkin" | "financeiro" | "lancamento" | "revenda" | "reembolsos";
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
  checkin: { total: number; inside: number; perMin: string; links: CheckinLink[]; sectors: { name: string; n: number; total: number; pct: number }[]; last: { id: string; name: string; what: string; at: string }[] };
  fin: { gross: string; buyerFees: string; platform: string; net: string; refunds: { id: string; name: string; value: string; when: string }[]; refundPct: string };
  launch?: LaunchProps;
  revenda?: RevendaProps;
  lista?: ListaProps;
  reembolsos?: RefundTab;
};

const n = (v: number) => v.toLocaleString("pt-BR");

export function PainelEvento(p: EventoPainelProps) {
  const { flash } = useToast();
  const [tab, setTab] = useState<Tab>(p.tab);
  const [more, setMore] = useState(false);
  const [del, setDel] = useState(false);
  const url = `${useOrigin()}/eventos/${p.ev.slug}`;
  const pick = (t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "geral") u.searchParams.delete("aba"); else u.searchParams.set("aba", t);
    window.history.replaceState(null, "", u.toString());
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash("Link copiado."); } catch { flash("Não foi possível copiar."); } };
  const TABS: [Tab, string, number][] = [["geral", "Visão geral", 0], ["participantes", "Participantes", p.people.length], ["lista", "Lista free", p.lista?.guests.length ?? 0], ["checkin", "Check-in", 0], ["financeiro", "Financeiro", p.fin.refunds.length], ["lancamento", "Lançamento", p.launch?.signups.length ?? 0], ["revenda", "Revenda e transferência", p.revenda?.kpis.active ?? 0], ["reembolsos", "Cancelamentos e reembolsos", p.reembolsos?.kpis.pending ?? 0]];

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
              <button className="mn-i" type="button" onClick={() => { setMore(false); pick("reembolsos"); }}>Cancelar, adiar ou reembolsar</button>
              <button className="mn-i danger" type="button" onClick={() => { setMore(false); setDel(true); }}>Excluir evento</button>
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
      {tab === "lista" && p.lista && <PainelLista p={p.lista} />}
      {tab === "checkin" && <Checkin p={p} />}
      {tab === "financeiro" && <Fin p={p} />}
      {tab === "lancamento" && p.launch && <PainelLancamento p={p.launch} />}
      {tab === "revenda" && p.revenda && <PainelRevenda p={p.revenda} />}
      {tab === "reembolsos" && p.reembolsos && <PainelReembolsos p={p.reembolsos} />}
      {del && <DeleteEvent id={p.ev.id} title={p.ev.title} sold={p.kpis.sold + p.fin.refunds.length} onClose={() => setDel(false)} onRefunds={() => { setDel(false); pick("reembolsos"); }} />}
    </div>
  );
}

/** Confirmação para excluir: só eventos sem venda; pede o nome do evento para não excluir sem querer. */
function DeleteEvent({ id, title, sold, onClose, onRefunds }: { id: string; title: string; sold: number; onClose: () => void; onRefunds: () => void }) {
  const router = useRouter();
  const { flash } = useToast();
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const ok = typed.trim().toLowerCase() === title.trim().toLowerCase();
  const go = () => start(async () => {
    const r = await deleteEvent(id, typed);
    if (!r.ok) { flash(r.error); return; }
    flash(`“${title}” foi excluído.`);
    router.push("/painel");
  });
  return (
    <PainelPortal>
      <div className="ml-ov" role="dialog" aria-modal="true" aria-label="Excluir evento" onClick={onClose}>
        <div className="ml-dlg dl-dlg" onClick={(e) => e.stopPropagation()}>
          {sold > 0 ? (
            <>
              <span className="dl-ic warn" aria-hidden="true">!</span>
              <h2 className="card-t">Este evento já vendeu ingressos</h2>
              <p className="dl-p">Quem comprou tem ingresso válido para “{title}”, então ele não pode ser excluído. Se o evento não vai acontecer, cancele em Cancelamentos e reembolsos: todos os compradores recebem o dinheiro de volta automaticamente.</p>
              <div className="dl-a"><button className="b2" type="button" onClick={onClose}>Fechar</button><button className="b2 dark" type="button" onClick={onRefunds}>Cancelar o evento</button></div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (ok) go(); }}>
              <span className="dl-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></span>
              <h2 className="card-t">Excluir “{title}”?</h2>
              <p className="dl-p">O evento, os lotes, os cupons, a lista de aviso e os links de divulgação dele somem para sempre. Isso não dá para desfazer.</p>
              <label className="fld"><span>Para confirmar, digite o nome do evento</span><input autoComplete="off" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={title} /></label>
              <div className="dl-a"><button className="b2" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="b2 danger" type="submit" disabled={!ok || busy}>{busy ? "Excluindo…" : "Excluir evento"}</button></div>
            </form>
          )}
        </div>
      </div>
    </PainelPortal>
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
            <Tbl label="Ingressos por setor">
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
            </Tbl>
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
  const tipX = ((b.x + BW / 2) / 720) * 100;
  const valText = (i: number) => mode === "receita" ? brl(vals[i]) : `${n(vals[i])} ${vals[i] === 1 ? "ingresso" : "ingressos"}`;
  // teclado: setas andam um dia, Page Up/Down uma semana, Home/End vão ao primeiro e ao último dia (hoje)
  const onKey = (ev: React.KeyboardEvent) => {
    const last = vals.length - 1;
    const to = { ArrowLeft: sel - 1, ArrowDown: sel - 1, ArrowRight: sel + 1, ArrowUp: sel + 1, PageDown: sel - 7, PageUp: sel + 7, Home: 0, End: last }[ev.key];
    if (to === undefined) return;
    ev.preventDefault();
    setSel(Math.min(last, Math.max(0, to)));
  };
  return (
    <section className="cx">
      <div className="card-h">
        <div><h2 className="card-t">Vendas por dia</h2><span className="card-s">Últimos 30 dias · {mode === "receita" ? `${brl(total)} líquidos` : `${n(total)} ingressos`}</span></div>
        <div className="seg2 sm">{(["receita", "ingressos"] as const).map((m) => <button key={m} className={mode === m ? "sg on" : "sg"} type="button" onClick={() => setMode(m)}>{m === "receita" ? "Receita" : "Ingressos"}</button>)}</div>
      </div>
      <div className="chart" tabIndex={0} role="slider" onKeyDown={onKey}
        aria-label={`Vendas por dia (${mode === "receita" ? "receita" : "ingressos"}). Use as setas para escolher o dia`}
        aria-valuemin={0} aria-valuemax={vals.length - 1} aria-valuenow={sel}
        aria-valuetext={`${c.labels[sel]}${sel === vals.length - 1 ? ", hoje" : ""}: ${valText(sel)}`}>
        <svg viewBox="0 0 720 220" className="ch-svg" aria-hidden="true">
          <g className="ch-grid">{grid.map((g) => <line key={g.y} x1="40" x2="716" y1={g.y} y2={g.y} />)}</g>
          {bars.map((r, i) => <rect key={i} className={i === sel ? "bx on" : "bx"} x={r.x.toFixed(1)} y={r.y.toFixed(1)} width={BW} height={r.h.toFixed(1)} rx="4" onClick={() => setSel(i)} />)}
        </svg>
        {grid.map((g) => <span key={g.y} className="ch-yl" style={{ top: `${(g.y / 220) * 100}%` }}>{g.v ? fmt(g.v) : "0"}</span>)}
        {[0, 7, 14, 21, vals.length - 1].map((i) => <span key={i} className="ch-xl" style={{ left: `${((X0 + i * SL + SL / 2) / 720) * 100}%` }}>{c.labels[i]}</span>)}
        {/* nas pontas o balão encosta na borda do gráfico em vez de sair da tela (barra de hoje, no celular) */}
        <div className={tipX > 80 ? "tip tip-r" : tipX < 20 ? "tip tip-l" : "tip"} style={{ left: `${tipX}%`, top: `${(b.y / 220) * 100}%` }}>
          <b className="tp-v">{valText(sel)}</b>
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
            <input autoComplete="off" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, e-mail ou pedido" aria-label="Buscar participante" />
          </label>
          <div className="chips3">{FIL.map(([k, l, c]) => <button key={k} className={f === k ? "chp on" : "chp"} type="button" onClick={() => setF(k)}>{l} <span className="sg-n">{n(c)}</span></button>)}</div>
          <div className="ca"><button className="b2" type="button" onClick={() => exportCsv(p.ev.title, list)}>Exportar CSV</button></div>
        </div>
        <Tbl label="Participantes">
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
        </Tbl>
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
            <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="84" fill="none" stroke="#EDEDEA" strokeWidth="16" />{pct > 0 && <circle cx="100" cy="100" r="84" fill="none" stroke="#EDFF3C" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${((pct / 100) * 528).toFixed(1)} 528`} transform="rotate(-90 100 100)" />}</svg>
            <div className="ci-c"><b className="ci-v">{n(c.inside)}</b><span className="ci-s">de {n(c.total)}</span></div>
          </div>
          <div className="ci-row"><div><b className="cr-v">{pct}%</b><span className="cr-k">entraram</span></div><div><b className="cr-v">{n(c.total - c.inside)}</b><span className="cr-k">faltam</span></div><div><b className="cr-v">{c.perMin}</b><span className="cr-k">por minuto</span></div></div>
          <span className="ci-note">{p.ev.countdown ? `${p.ev.countdown} para o evento. ` : ""}Atualize a página para ver as entradas mais recentes.</span>
        </section>
        <div className="ci-r">
          <CheckinLinks eventId={p.ev.id} links={c.links} />
          {p.lista && p.lista.guests.length > 0 && <ListaResumo l={p.lista} />}
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

/** Entrada da lista free (à parte dos ingressos vendidos). */
function ListaResumo({ l }: { l: ListaProps }) {
  const total = l.guests.reduce((s, g) => s + 1 + g.guests, 0);
  const inn = l.guests.reduce((s, g) => s + (g.inAt ? 1 + g.guests : 0), 0);
  return (
    <section className="cx">
      <div className="card-h"><h2 className="card-t">Lista free</h2><span className="card-s">{n(l.guests.length)} {l.guests.length === 1 ? "nome" : "nomes"}</span></div>
      <div className="src2"><span className="sr-n">Entraram</span><span className="bar"><i style={{ width: `${total ? Math.round((inn / total) * 100) : 0}%` }} /></span><b className="sr-v">{n(inn)}/{n(total)}</b></div>
    </section>
  );
}

function Fin({ p }: { p: EventoPainelProps }) {
  const f = p.fin;
  return (
    <div className="pane2">
      <div className="fin">
        <div className="fl"><span className="fl-k">Vendido em ingressos</span><b className="fl-v">{f.gross}</b></div>
        <span className="fl-op" aria-hidden="true">−</span>
        <div className="fl"><span className="fl-k">{p.ev.absorbFee ? "Taxa Tickets Win (7,99%, absorvida por você)" : "Taxa Tickets Win (paga pelo comprador)"}</span><b className="fl-v">{p.ev.absorbFee ? f.platform : brl(0)}</b></div>
        <span className="fl-op" aria-hidden="true">=</span>
        <div className="fl hl"><span className="fl-k">Seu líquido</span><b className="fl-v">{f.net}</b></div>
      </div>
      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Repasses</h2><span className="card-s">{p.ev.absorbFee ? "" : `Os compradores pagaram ${f.buyerFees} de taxa de serviço, à parte. `}Vendas de teste não geram repasse.</span></div></div>
            <div className="bal"><div><span className="bl-k">Líquido das vendas</span><b className="bl-v">{f.net}</b></div><div><span className="bl-k">Reembolsado</span><b className="bl-v">{f.refundPct}%</b></div></div>
            <p className="card-s" style={{ marginTop: 16 }}>O líquido deste evento entra no Banco Tickets Win e fica disponível para saque 2 dias depois que o evento acaba.</p>
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
  const lines = [["Nome", "E-mail", "Ingresso", "Meia", "Pedido", "Compra", "Check-in"], ...rows.map((r) => [r.name, r.email, r.ticket, r.meia ? "sim" : "não", r.order, r.date, r.inAt ?? ""])];
  const blob = csvBlob(lines);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `participantes-${title.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
