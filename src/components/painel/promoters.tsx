"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { createPromoter, setPromoterActive } from "@/lib/actions/promoters";
import { useOrigin } from "./use-origin";
import { Tbl } from "@/components/painel/tbl";

export type PromoterRow = {
  id: string; name: string; email: string; event: string; code: string; token: string; pct: number; active: boolean;
  clicks: number; orders: number; tickets: number; revenue: string; commission: string; conv: string;
};
export type PromotersProps = {
  rows: PromoterRow[];
  events: { id: string; title: string }[];
  totals: { orders: number; revenue: string; commission: string };
};

/** Links de divulgação com comissão: cada parceiro tem o seu link e uma página para acompanhar as vendas. */
export function PainelPromoters({ p, ranked = false }: { p: PromotersProps; ranked?: boolean }) {
  const router = useRouter();
  const { flash } = useToast();
  const origin = useOrigin();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", eventId: "", pct: "10", code: "" });
  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));
  const copy = async (text: string, ok: string) => { try { await navigator.clipboard.writeText(text); flash(ok); } catch { flash("Não foi possível copiar."); } };

  const create = () => start(async () => {
    const r = await createPromoter({ name: f.name, email: f.email.trim(), eventId: f.eventId, pct: Number(f.pct) || 0, code: f.code });
    if (!r.ok) { flash(r.error); return; }
    flash(`Link de ${f.name} criado.`);
    setF({ name: "", email: "", eventId: "", pct: "10", code: "" }); setOpen(false);
    router.refresh();
  });
  const toggle = (id: string, active: boolean) => start(async () => {
    const r = await setPromoterActive(id, active);
    if (!r.ok) flash(r.error); else { flash(active ? "Link reativado." : "Link pausado: os cliques não contam mais."); router.refresh(); }
  });

  return (
    <section className="cx">
      <div className="card-h wrap2">
        <div><h2 className="card-t">{ranked ? "Ranking de promoters" : "Links de comissão"}</h2><span className="card-s">{ranked ? "Ordenado por valor vendido. Cada promoter tem um link próprio e uma página para acompanhar as vendas." : "Promoters, influenciadores e parceiros ganham um link próprio. Quem compra por ele em até 30 dias conta para o parceiro."}</span></div>
        <div className="ca"><button className="b2 dark" type="button" onClick={() => setOpen((v) => !v)}>{open ? "Cancelar" : ranked ? "Novo promoter" : "Novo parceiro"}</button></div>
      </div>

      {open && (
        <div className="pr-new">
          <div className="frm-2">
            <label className="fld"><span>Nome</span><input autoComplete="off" value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Ana Promoter" /></label>
            <label className="fld"><span>E-mail (opcional)</span><input autoComplete="off" type="email" value={f.email} maxLength={254} onChange={(e) => set({ email: e.target.value })} placeholder="para você lembrar quem é" /></label>
          </div>
          <div className="frm-3">
            <label className="fld"><span>Evento</span><select value={f.eventId} onChange={(e) => set({ eventId: e.target.value })}><option value="">Todos os meus eventos</option>{p.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
            <label className="fld"><span>Comissão</span><span className="pfx"><input autoComplete="off" type="number" min={1} max={50} value={f.pct} onChange={(e) => set({ pct: e.target.value })} /><em>% das vendas</em></span></label>
            <label className="fld"><span>Código do link (opcional)</span><span className="pfx"><em>/r/</em><input autoComplete="off" value={f.code} maxLength={32} onChange={(e) => set({ code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="ana" /></span></label>
          </div>
          <div className="pr-go"><small>A comissão é sobre o valor dos ingressos, sem a taxa de serviço.</small><button className="b2 dark" type="button" onClick={create} disabled={busy || f.name.trim().length < 2}>{busy ? "Criando…" : "Criar link"}</button></div>
        </div>
      )}

      {p.rows.length > 0 && (
        <div className="pr-tot">
          <span><b>{p.totals.orders}</b> {p.totals.orders === 1 ? "venda" : "vendas"} por parceiros</span>
          <span><b>{p.totals.revenue}</b> em ingressos</span>
          <span><b>{p.totals.commission}</b> de comissão a pagar</span>
        </div>
      )}
      <Tbl label="Vendas por parceiro">
        {p.rows.map((r, i) => (
          <div className={`${r.active ? "pr-row" : "pr-row off"}${ranked ? " rk" : ""}`} key={r.id}>
            {ranked && <span className={i < 3 && r.tickets > 0 ? `pr-rk top${i + 1}` : "pr-rk"} aria-label={`${i + 1}º lugar`}>{i + 1}</span>}
            <div className="pr-who">
              <b>{r.name}<span className="pr-pct">{r.pct}%</span></b>
              <span>{r.event}</span>
              <div className="pr-link">
                <code>{origin.replace(/^https?:\/\//, "")}/r/{r.code}</code>
                <button type="button" onClick={() => void copy(`${origin}/r/${r.code}`, "Link de divulgação copiado.")}>Copiar link</button>
                <button type="button" onClick={() => void copy(`${origin}/parceiro/${r.token}`, "Página do parceiro copiada. Envie para ele acompanhar as vendas.")}>Página do parceiro</button>
              </div>
            </div>
            <div className="pr-n"><b>{r.clicks}</b><span>{r.clicks === 1 ? "clique" : "cliques"}{r.conv ? ` · ${r.conv}` : ""}</span></div>
            <div className="pr-n"><b>{r.tickets}</b><span>{r.tickets === 1 ? "ingresso" : "ingressos"}</span></div>
            <div className="pr-n"><b>{r.revenue}</b><span>vendido</span></div>
            <div className="pr-n strong"><b>{r.commission}</b><span>comissão</span></div>
            <button className="b2" type="button" onClick={() => toggle(r.id, !r.active)} disabled={busy}>{r.active ? "Pausar" : "Reativar"}</button>
          </div>
        ))}
        {!p.rows.length && !open && <div className="empty2"><b className="em-t">Nenhum parceiro ainda</b><span className="em-s">Crie um link para cada promoter: as vendas e a comissão de cada um aparecem aqui.</span></div>}
      </Tbl>
    </section>
  );
}
