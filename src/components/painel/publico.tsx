"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Buyer = { id: string; name: string; ini: string; bg: string; email: string; orders: number; tickets: number; spent: string; events: number; last: string; meia: boolean };
export type PublicoProps = {
  kpis: { l: string; v: string; n: string }[];
  perEvent: { id: string; title: string; buyers: number; back: number }[];
  buyers: Buyer[];
  orgSlug: string | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PainelPublico(p: PublicoProps) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "back" | "meia">("all");
  const list = useMemo(() => {
    const nq = norm(q.trim());
    return p.buyers.filter((b) => (f === "all" || (f === "back" ? b.events > 1 : b.meia)) && (!nq || norm(`${b.name} ${b.email}`).includes(nq)));
  }, [p.buyers, q, f]);
  const max = Math.max(1, ...p.perEvent.map((e) => e.buyers));
  const FIL: [typeof f, string, number][] = [["all", "Todos", p.buyers.length], ["back", "Voltaram", p.buyers.filter((b) => b.events > 1).length], ["meia", "Meia-entrada", p.buyers.filter((b) => b.meia).length]];

  const csv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Nome", "E-mail", "Pedidos", "Ingressos", "Eventos", "Gasto", "Última compra"], ...list.map((b) => [b.name, b.email, b.orders, b.tickets, b.events, b.spent, b.last])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "compradores.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">Público</h1><p className="pg-s">Quem compra e quem acompanha os seus eventos</p></div></div>
      <div className="kpis">
        {p.kpis.map((k) => <div className="kpi" key={k.l}><span className="kp-l">{k.l}</span><b className="kp-v">{k.v}</b><div className="kp-f"><span className="kp-n">{k.n}</span></div></div>)}
      </div>

      <div className="cols">
        <section className="cx">
          <div className="card-h wrap2">
            <label className="pd-search in-card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
              <input autoComplete="off" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar comprador" />
            </label>
            <div className="chips3">{FIL.map(([k, l, c]) => <button key={k} className={f === k ? "chp on" : "chp"} type="button" onClick={() => setF(k)}>{l} <span className="sg-n">{c}</span></button>)}</div>
            <div className="ca"><button className="b2" type="button" onClick={csv} disabled={!list.length}>Exportar CSV</button></div>
          </div>
          <div className="tbl">
            <div className="tr5 thd"><span>Comprador</span><span className="num">Ingressos</span><span className="num">Eventos</span><span className="num">Gasto</span><span>Última compra</span></div>
            {list.slice(0, 300).map((b) => (
              <div className="tr5" key={b.id}>
                <span className="pp"><span className="pp-av" style={{ background: b.bg }}>{b.ini}</span><span className="pp-i"><b className="pp-n">{b.name}</b><span className="pp-e">{b.email}</span></span></span>
                <span className="num">{b.tickets}</span>
                <span className="num">{b.events > 1 ? <span className="st on">{b.events}</span> : b.events}</span>
                <b className="num">{b.spent}</b>
                <span className="pp-d">{b.last}</span>
              </div>
            ))}
            {list.length === 0 && <div className="empty2"><b className="em-t">{p.buyers.length ? "Ninguém encontrado" : "Ainda sem compradores"}</b><span className="em-s">{p.buyers.length ? "Tente outro nome ou e-mail." : "Quem comprar ingresso para os seus eventos aparece aqui."}</span></div>}
          </div>
          <span className="tbl-f">Mostrando {Math.min(300, list.length)} de {list.length} compradores · o CSV leva a lista filtrada inteira</span>
        </section>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Compradores por evento</h2></div>
            {p.perEvent.length ? p.perEvent.map((e) => (
              <Link className="src2" key={e.id} href={`/painel/evento/${e.id}?aba=participantes`} style={{ gridTemplateColumns: "minmax(0,1fr) 80px 44px" }}>
                <span className="sr-n" title={e.title} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                <span className="bar"><i style={{ width: `${(e.buyers / max) * 100}%` }} /></span>
                <b className="sr-v">{e.buyers}</b>
              </Link>
            )) : <span className="card-s">Sem vendas ainda.</span>}
          </section>
          <section className="cx pay">
            <span className="py-k">Fale com quem segue você</span>
            <b className="py-v" style={{ fontSize: 22 }}>Publique uma novidade</b>
            <span className="py-s">Line-up novo, virada de lote ou fotos do último evento aparecem na sua página para os seguidores.</span>
            {p.orgSlug && <Link className="b2" href={`/produtor/${p.orgSlug}`}>Ir para a minha página</Link>}
          </section>
        </aside>
      </div>
    </div>
  );
}
