"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { producerCancelListing, saveTransferResale } from "@/lib/actions/revenda";

type Listing = { id: string; code: string; what: string; price: string; pct: number; status: "active" | "reserved" | "sold" | "cancelled"; when: string };
export type RevendaProps = {
  eventId: string;
  transferEnabled: boolean;
  resaleEnabled: boolean;
  resaleMaxPct: number;
  kpis: { active: number; sold: number; volume: string; transfers: number };
  listings: Listing[];
};

const ST: Record<Listing["status"], [string, string]> = {
  active: ["À venda", "st on"], reserved: ["Em pagamento", "st warn"], sold: ["Revendido", "st draft"], cancelled: ["Fora do ar", "st end"],
};

/** Aba "Revenda e transferência": o que o comprador pode fazer com o ingresso depois da compra. */
export function PainelRevenda({ p }: { p: RevendaProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const [f, setF] = useState({ transferEnabled: p.transferEnabled, resaleEnabled: p.resaleEnabled, resaleMaxPct: String(p.resaleMaxPct) });
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();
  const [view, setView] = useState<"open" | "sold" | "all">("open");
  const set = (x: Partial<typeof f>) => { setF((o) => ({ ...o, ...x })); setDirty(true); };

  const save = () => start(async () => {
    const r = await saveTransferResale(p.eventId, { transferEnabled: f.transferEnabled, resaleEnabled: f.resaleEnabled, resaleMaxPct: Number(f.resaleMaxPct) || 0 });
    if (!r.ok) { flash(r.error); return; }
    setDirty(false); flash("Regras salvas."); router.refresh();
  });
  const takeDown = (id: string) => start(async () => {
    const r = await producerCancelListing(id);
    if (!r.ok) flash(r.error); else { flash("Anúncio tirado do ar."); router.refresh(); }
  });

  const open = p.listings.filter((l) => l.status === "active" || l.status === "reserved");
  const sold = p.listings.filter((l) => l.status === "sold");
  const shown = view === "open" ? open : view === "sold" ? sold : p.listings;
  const pct = Number(f.resaleMaxPct) || 0;
  const turningOff = p.resaleEnabled && !f.resaleEnabled && open.length > 0;

  const kpis: [string, string, string][] = [
    ["Revenda", p.resaleEnabled ? "Ligada" : "Desligada", p.resaleEnabled ? `até ${p.resaleMaxPct}% do valor pago` : "ninguém pode anunciar"],
    ["À venda agora", String(p.kpis.active), "ingressos anunciados"],
    ["Revendidos", String(p.kpis.sold), `${p.kpis.volume} movimentados`],
    ["Transferências", String(p.kpis.transfers), p.transferEnabled ? "entre amigos, sem custo" : "desligadas"],
  ];

  return (
    <div className="lnc">
      <div className="kpis">
        {kpis.map(([l, v, s]) => <div className="kpi" key={l}><span className="kp-l">{l}</span><b className="kp-v">{v}</b><div className="kp-f"><span className="kp-n">{s}</span></div></div>)}
      </div>

      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h wrap2">
              <div><h2 className="card-t">Anúncios da revenda</h2><span className="card-s">Ingressos que os compradores colocaram à venda. Na revenda o QR code antigo deixa de valer e o comprador recebe um novo.</span></div>
              <div className="ca">
                <div className="seg2 sm">
                  <button className={view === "open" ? "sg on" : "sg"} type="button" onClick={() => setView("open")}>À venda <span className="sg-n">{open.length}</span></button>
                  <button className={view === "sold" ? "sg on" : "sg"} type="button" onClick={() => setView("sold")}>Revendidos <span className="sg-n">{sold.length}</span></button>
                  <button className={view === "all" ? "sg on" : "sg"} type="button" onClick={() => setView("all")}>Todos</button>
                </div>
              </div>
            </div>
            <div className="tbl">
              {shown.slice(0, 200).map((l) => (
                <div className="ln-row rv-row" key={l.id}>
                  <span className="ln-e">{l.what}<small>{l.code} · {l.when}</small></span>
                  <span className="rv-p">{l.price}<small className={l.pct > 100 ? "up" : undefined}>{l.pct}% do valor</small></span>
                  <span className={ST[l.status][1]}>{ST[l.status][0]}</span>
                  {l.status === "active" ? <button className="b2" type="button" disabled={busy} onClick={() => takeDown(l.id)}>Tirar do ar</button> : <span />}
                </div>
              ))}
              {!shown.length && (
                <div className="empty2">
                  <b className="em-t">{view === "sold" ? "Nenhuma revenda ainda" : "Nenhum anúncio"}</b>
                  <span className="em-s">{p.resaleEnabled ? "Quando alguém não puder ir, anuncia o ingresso pela página dele e o anúncio aparece aqui e na página do evento." : "A revenda está desligada. Ligue ao lado para que os compradores possam revender com segurança."}</span>
                </div>
              )}
            </div>
            {shown.length > 200 && <span className="tbl-f">Mostrando 200 de {shown.length}.</span>}
          </section>
        </div>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Regras do evento</h2><span className="card-s">O que o comprador pode fazer com o ingresso depois de comprar.</span></div></div>
            <div className="frm">
              <label className="tg2">
                <span><b>Permitir transferência</b><small>O comprador envia o ingresso para outra pessoa pelo e-mail, de graça. O QR code muda na hora.</small></span>
                <input className="sr" type="checkbox" checked={f.transferEnabled} onChange={(e) => set({ transferEnabled: e.target.checked })} /><span className="sw" aria-hidden="true" />
              </label>
              <label className="tg2">
                <span><b>Permitir revenda oficial</b><small>O comprador anuncia o ingresso aqui na Tickets Win e recebe quando alguém compra. Sem cambista, sem golpe.</small></span>
                <input className="sr" type="checkbox" checked={f.resaleEnabled} onChange={(e) => set({ resaleEnabled: e.target.checked })} /><span className="sw" aria-hidden="true" />
              </label>
              {f.resaleEnabled && (
                <label className="fld">
                  <span>Preço máximo na revenda</span>
                  <span className="pfx"><input type="number" min={50} max={300} step={5} value={f.resaleMaxPct} onChange={(e) => set({ resaleMaxPct: e.target.value })} /><em>% do valor pago</em></span>
                  <small>{pct < 50 || pct > 300 ? "Use de 50% a 300%." : pct === 100 ? "Ninguém revende acima do que pagou." : `Um ingresso de R$ 100 pode ser revendido por até R$ ${pct}.`}</small>
                </label>
              )}
              {turningOff && <small className="rv-w">Ao salvar, os {open.length} anúncios à venda saem do ar. Quem estiver pagando agora termina a compra.</small>}
              <ul className="rv-how">
                <li>O vendedor recebe o valor anunciado menos 5%.</li>
                <li>O comprador paga a taxa de serviço normal.</li>
                <li>Ingresso já usado na portaria não pode ser anunciado.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>

      {dirty && (
        <div className="save-bar">
          <span>Você tem alterações não salvas.</span>
          <button className="b2" type="button" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      )}
    </div>
  );
}
