"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { createCoupon, setCouponActive } from "@/lib/actions/painel";
import type { PromotersProps } from "./promoters";
import { useOrigin } from "./use-origin";
import { Tbl } from "@/components/painel/tbl";

export type MarketingProps = {
  events: { id: string; slug: string; title: string; when: string; unlisted: boolean }[];
  coupons: { id: string; code: string; event: string; off: string; uses: string; discount: string; revenue: string; until: string; active: boolean; expired: boolean; sector: string | null }[];
  totals: { uses: number; off: string; rev: string };
  orgSlug: string | null;
  promoters: PromotersProps | null;
};

export function PainelMarketing(p: MarketingProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [form, setForm] = useState({ eventId: p.events[0]?.id ?? "", code: "", kind: "pct" as "pct" | "brl", value: "", limit: "", until: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const origin = useOrigin();

  const create = () => start(async () => {
    const value = Number(form.value.replace(",", "."));
    const r = await createCoupon({ eventId: form.eventId, code: form.code, kind: form.kind, value, limit: Number(form.limit) || 0, until: form.until });
    if (!r.ok) { flash(r.error); return; }
    flash(`Cupom ${form.code.toUpperCase()} criado.`);
    set({ code: "", value: "", limit: "", until: "" });
    router.refresh();
  });
  const toggle = (id: string, active: boolean) => start(async () => {
    const r = await setCouponActive(id, active);
    if (!r.ok) { flash(r.error); return; }
    flash(active ? "Cupom reativado." : "Cupom pausado.");
    router.refresh();
  });
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); flash("Link copiado."); } catch { flash("Não foi possível copiar."); } };

  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">Marketing</h1><p className="pg-s">Cupons, links para divulgar e novidades para quem segue você</p></div></div>
      <div className="kpis">
        <div className="kpi"><span className="kp-l">Usos de cupom</span><b className="kp-v">{p.totals.uses}</b><div className="kp-f"><span className="kp-n">pedidos pagos com cupom</span></div></div>
        <div className="kpi"><span className="kp-l">Vendido com cupom</span><b className="kp-v">{p.totals.rev}</b><div className="kp-f"><span className="kp-n">já com o desconto</span></div></div>
        <div className="kpi"><span className="kp-l">Descontos dados</span><b className="kp-v">{p.totals.off}</b><div className="kp-f"><span className="kp-n">soma dos cupons</span></div></div>
        <div className="kpi"><span className="kp-l">Cupons ativos</span><b className="kp-v">{p.coupons.filter((c) => c.active).length}</b><div className="kp-f"><span className="kp-n">de {p.coupons.length} criados</span></div></div>
      </div>

      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Cupons</h2><span className="card-s">Pause um cupom a qualquer momento; quem já comprou não é afetado.</span></div></div>
            <Tbl label="Cupons">
              <div className="tr6 thd"><span>Código</span><span>Evento</span><span>Desconto</span><span>Usos</span><span>Validade</span><span /></div>
              {p.coupons.map((c) => (
                <div className="tr6" key={c.id}>
                  <span><span className="cp-c">{c.code}</span></span>
                  <span className="pp-d" title={c.event} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.event}{c.sector ? ` · ${c.sector}` : ""}</span>
                  <b>{c.off}</b>
                  <span>{c.uses}</span>
                  <span className="pp-d">{c.until}</span>
                  {c.expired
                    ? <span className="st end">Vencido</span>
                    : <button className={c.active ? "st on" : "st draft"} type="button" disabled={busy} onClick={() => toggle(c.id, !c.active)} title={c.active ? "Pausar" : "Reativar"} style={{ cursor: "pointer", border: 0 }}>{c.active ? "Ativo" : "Pausado"}</button>}
                </div>
              ))}
              {p.coupons.length === 0 && <div className="empty2"><b className="em-t">Nenhum cupom ainda</b><span className="em-s">Crie o primeiro ao lado: parceiros, lista VIP, promoção relâmpago.</span></div>}
            </Tbl>
          </section>

          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Links para divulgar</h2><span className="card-s">Cole no Instagram, no WhatsApp ou envie para parceiros.</span></div></div>
            {p.events.length ? p.events.map((e) => {
              const url = `${origin}/eventos/${e.slug}`;
              return (
                <div className="lnk2" key={e.id}>
                  <span style={{ minWidth: 0 }}><b>{e.title}</b><code>{url.replace(/^https?:\/\//, "")}{e.unlisted ? " · só com link" : ""}</code></span>
                  <button className="b2" type="button" onClick={() => void copy(url)}>Copiar</button>
                  <a className="b2" href={`https://wa.me/?text=${encodeURIComponent(`${e.title} · ${e.when}\n${url}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                </div>
              );
            }) : <span className="card-s">Nenhum evento publicado com data futura.</span>}
          </section>
        </div>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Novo cupom</h2></div>
            {p.events.length ? (
              <div className="frm">
                <label className="fld"><span>Evento</span><select value={form.eventId} onChange={(e) => set({ eventId: e.target.value })}>{p.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
                <label className="fld"><span>Código</span><input autoComplete="off" value={form.code} maxLength={40} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="PARCEIRO10" /></label>
                <div className="frm-2">
                  <label className="fld"><span>Tipo</span><select value={form.kind} onChange={(e) => set({ kind: e.target.value as "pct" | "brl" })}><option value="pct">%</option><option value="brl">R$</option></select></label>
                  <label className="fld"><span>{form.kind === "pct" ? "Desconto (%)" : "Desconto (R$)"}</span><input autoComplete="off" value={form.value} inputMode="decimal" onChange={(e) => set({ value: e.target.value })} placeholder={form.kind === "pct" ? "10" : "20,00"} /></label>
                </div>
                <div className="frm-2">
                  <label className="fld"><span>Limite de usos</span><input autoComplete="off" value={form.limit} inputMode="numeric" onChange={(e) => set({ limit: e.target.value.replace(/\D/g, "") })} placeholder="Sem limite" /></label>
                  <label className="fld"><span>Válido até</span><input autoComplete="off" value={form.until} onChange={(e) => set({ until: e.target.value })} placeholder="31/12/2026" /></label>
                </div>
                <button className="b2 dark block" type="button" onClick={create} disabled={busy || !form.code || !form.value}>{busy ? "Criando…" : "Criar cupom"}</button>
                <span className="card-s">Cupons só de um setor são criados na etapa Ingressos do evento.</span>
              </div>
            ) : <span className="card-s">Publique um evento para criar cupons.</span>}
          </section>
          <section className="cx pay">
            <span className="py-k">Avise quem segue você</span>
            <b className="py-v" style={{ fontSize: 22 }}>Publique uma novidade</b>
            <span className="py-s">Ela aparece na aba Novidades da sua página para os seguidores.</span>
            {p.orgSlug && <Link className="b2" href={`/produtor/${p.orgSlug}`}>Abrir minha página</Link>}
          </section>
        </aside>
      </div>
      <section className="cx pm-link">
        <div><h2 className="card-t">Promoters</h2><span className="card-s">Links com comissão, ranking de quem mais vende e a página de cada promoter.</span></div>
        <Link className="b2 dark" href="/painel/promoters">Abrir promoters</Link>
      </section>
    </div>
  );
}
