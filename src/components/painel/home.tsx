"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { FlyerArt } from "@/components/art/flyer";

type Kpi = { label: string; value: string; text: string; cls: string; note: string; line: string; area: string };
type Period = "7d" | "30d" | "all";
type EvTab = "sale" | "draft" | "end";
export type FeedRow = { id: string; name: string; ini: string; bg: string; qty: string; what: string; ago: string; value: string };

export type HomeProps = {
  greeting: string;
  sub: string;
  query: string;
  kpis: Record<Period, Kpi[]>;
  todos: { id: string; cls: string; title: string; text: string; cta: string; href: string }[];
  events: { id: string; title: string; flyerId: string; when: string; where: string; status: string; stCls: string; tab: string; soldLabel: string; pct: number; revenue: string; href: string; cta: string }[];
  feed: FeedRow[];
  futureNet: string;
};

/* pendências marcadas como "Feito" ficam guardadas neste navegador */
const DONE_KEY = "painel:feito";
const readDone = () => { try { return localStorage.getItem(DONE_KEY) ?? "[]"; } catch { return "[]"; } };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export function PainelHome(p: HomeProps) {
  const [period, setPeriod] = useState<Period>("30d");
  const [tab, setTab] = useState<EvTab>(p.events.some((e) => e.tab === "sale") ? "sale" : p.events.some((e) => e.tab === "draft") ? "draft" : "end");
  const doneRaw = useSyncExternalStore(subscribe, readDone, () => "[]");
  const done = new Set<string>(JSON.parse(doneRaw) as string[]);
  const markDone = (id: string) => {
    try { localStorage.setItem(DONE_KEY, JSON.stringify([...done, id].slice(-200))); } catch { /* sem armazenamento */ }
    listeners.forEach((l) => l());
  };
  const todos = p.todos.filter((t) => !done.has(t.id));
  const list = p.events.filter((e) => e.tab === tab);
  const TABS: [EvTab, string][] = [["sale", "À venda"], ["draft", "Rascunhos"], ["end", "Encerrados"]];

  return (
    <div className="pane">
      <div className="pg-h">
        <div><h1 className="pg-t">{p.greeting}</h1><p className="pg-s">{p.sub}</p></div>
        <div className="seg2">{(["7d", "30d", "all"] as Period[]).map((k) => <button key={k} className={period === k ? "sg on" : "sg"} type="button" onClick={() => setPeriod(k)}>{k === "7d" ? "7 dias" : k === "30d" ? "30 dias" : "Tudo"}</button>)}</div>
      </div>

      {p.todos.length > 0 && (
        <section className="att" aria-label="Precisa da sua atenção">
          <div className="att-h"><b className="att-t">Precisa da sua atenção</b><span className="att-n">{todos.length}</span></div>
          {todos.map((t) => (
            <div key={t.id} className={t.cls}>
              <span className="td-i" aria-hidden="true" />
              <div className="td-x"><b className="td-t">{t.title}</b><span className="td-s">{t.text}</span></div>
              <Link className="b2" href={t.href}>{t.cta}</Link>
              <button className="td-d" type="button" onClick={() => markDone(t.id)} aria-label="Marcar como resolvido">Feito</button>
            </div>
          ))}
          {todos.length === 0 && <div className="td-ok">Tudo em dia. Nenhuma pendência agora.</div>}
        </section>
      )}

      <div className="kpis">
        {p.kpis[period].map((k) => (
          <div className="kpi" key={k.label}>
            <span className="kp-l">{k.label}</span>
            <b className="kp-v">{k.value}</b>
            <div className="kp-f">{k.text && <span className={k.cls}>{k.text}</span>}<span className="kp-n">{k.note}</span></div>
            <svg className="spk" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path d={k.area} fill="#D3F55B" opacity=".35" /><path d={k.line} fill="none" stroke="#111111" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
          </div>
        ))}
      </div>

      <div className="cols">
        <section className="cx evs">
          <div className="card-h">
            <h2 className="card-t">{p.query ? `Eventos com “${p.query}”` : "Seus eventos"}</h2>
            <div className="seg2 sm">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "sg on" : "sg"} type="button" onClick={() => setTab(k)}>{l} <span className="sg-n">{p.events.filter((e) => e.tab === k).length}</span></button>)}</div>
          </div>
          <div className="evl">
            {list.map((e) => (
              <div className="evr" key={e.id}>
                <div className="evr-art"><FlyerArt id={e.flyerId} /></div>
                <div className="evr-i"><b className="evr-t">{e.title}</b><span className="evr-s">{e.when} · {e.where}</span><span className={e.stCls}>{e.status}</span></div>
                <div className="evr-p"><div className="evr-ph"><span className="evr-k">Vendidos</span><b className="evr-v">{e.soldLabel}</b></div><span className="bar"><i style={{ width: `${e.pct}%` }} /></span></div>
                <div className="evr-r"><span className="evr-k">Receita líquida</span><b className="evr-v">{e.revenue}</b></div>
                <Link className="b2 dark" href={e.href}>{e.cta}</Link>
              </div>
            ))}
            {list.length === 0 && (
              <div className="empty2">
                <b className="em-t">{tab === "sale" ? "Nenhum evento à venda" : tab === "draft" ? "Nenhum rascunho" : "Nenhum evento encerrado"}</b>
                <span className="em-s">{tab === "sale" ? "Publique um evento para acompanhar as vendas aqui." : "Quando houver, eles aparecem aqui."}</span>
                <Link className="b2 dark" href="/criar-evento">Criar evento</Link>
              </div>
            )}
          </div>
        </section>

        <aside className="side2">
          <section className="cx live">
            <div className="card-h"><h2 className="card-t">Vendas agora</h2><span className="live-d"><i />Ao vivo</span></div>
            {p.feed.length ? p.feed.map((f) => <Feed key={f.id} f={f} />) : <span className="card-s">As vendas aparecem aqui assim que acontecerem.</span>}
          </section>
          <section className="cx pay">
            <span className="py-k">Vendas líquidas de eventos futuros</span>
            <b className="py-v">{p.futureNet}</b>
            <span className="py-s">O repasse para a sua conta entra quando o pagamento real for ligado.</span>
            <Link className="b2" href="/painel/financeiro">Ver financeiro</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Feed({ f, withEvent = true }: { f: FeedRow; withEvent?: boolean }) {
  return (
    <div className="fd">
      <span className="fd-av" style={{ background: f.bg }}>{f.ini}</span>
      <div className="fd-i"><b className="fd-n">{f.name}</b><span className="fd-s">{f.qty}{withEvent && f.what ? ` · ${f.what}` : ""} · {f.ago}</span></div>
      <b className="fd-v">{f.value}</b>
    </div>
  );
}
