"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { FlyerArt } from "@/components/art/flyer";
import { createCampaign, createEventCampaign, createFromSaved, deleteCampaign, deleteTemplate, duplicateCampaign } from "@/lib/actions/emails";
import { MOTIVES, type Motive } from "@/lib/mail/event-email";
import type { TemplateKey } from "@/lib/mail/templates";
import { PainelPortal } from "./portal";
import { Tbl } from "@/components/painel/tbl";

type Row = { id: string; name: string; subject: string; status: string; when: string; recipients: number; open: string; click: string; progress: number };
export type EmailsProps = {
  emailOn: boolean;
  kpis: { contacts: number; sent: number; open: string; click: string; unsub: number; campaigns: number };
  campaigns: Row[];
  templates: { key: TemplateKey; name: string; desc: string; needsEvent: boolean }[];
  saved: { id: string; name: string }[];
  events: { id: string; title: string; when: string; past: boolean; flyerId: string }[];
};

export const STATUS: Record<string, [string, string]> = {
  draft: ["Rascunho", "st draft"], scheduled: ["Agendada", "st warn"], sending: ["Enviando", "st warn"], sent: ["Enviada", "st on"], cancelled: ["Cancelada", "st end"],
};
const n = (v: number) => v.toLocaleString("pt-BR");

/** Lista de campanhas de e-mail e a escolha do modelo para começar uma nova. */
export function PainelEmails(p: EmailsProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState<"all" | "draft" | "sent">("all");
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  // campanha enviando: atualiza o progresso sozinho
  const sending = p.campaigns.some((c) => c.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [sending, router]);

  const shown = p.campaigns.filter((c) => filter === "all" || (filter === "draft" ? c.status === "draft" || c.status === "scheduled" : c.status === "sent" || c.status === "sending"));
  const act = (fn: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { flash(r.error); return; }
    flash(ok);
    if ("id" in r && r.id) router.push(`/painel/emails/${r.id}`); else router.refresh();
  });

  return (
    <div className="pane">
      <div className="pg-h">
        <div><h1 className="pg-t">E-mails</h1><p className="pg-s">Anuncie eventos, mande cupons e lembretes para quem compra e segue você</p></div>
        <button className="b2 dark" type="button" onClick={() => setPicker(true)}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>Novo e-mail
        </button>
      </div>
      {!p.emailOn && <div className="warn2"><b className="wr-t">Envio desligado.</b><span className="wr-s">Você já pode montar e agendar campanhas. Os e-mails começam a sair assim que o envio for ligado.</span></div>}

      <div className="kpis">
        <div className="kpi"><span className="kp-l">Contatos</span><b className="kp-v">{n(p.kpis.contacts)}</b><div className="kp-f"><span className="kp-n">compradores, seguidores e listas</span></div></div>
        <div className="kpi"><span className="kp-l">E-mails enviados</span><b className="kp-v">{n(p.kpis.sent)}</b><div className="kp-f"><span className="kp-n">em {p.kpis.campaigns} {p.kpis.campaigns === 1 ? "campanha" : "campanhas"}</span></div></div>
        <div className="kpi"><span className="kp-l">Taxa de abertura</span><b className="kp-v">{p.kpis.open}</b><div className="kp-f"><span className="kp-n">de quem recebeu</span></div></div>
        <div className="kpi"><span className="kp-l">Taxa de cliques</span><b className="kp-v">{p.kpis.click}</b><div className="kp-f"><span className="kp-n">{n(p.kpis.unsub)} {p.kpis.unsub === 1 ? "descadastro" : "descadastros"}</span></div></div>
      </div>

      {p.campaigns.length === 0 ? (
        <section className="cx ml-start">
          <div className="card-h"><div><h2 className="card-t">Mande o primeiro e-mail</h2><span className="card-s">Escolha o evento e o motivo. O e-mail sai pronto no formato da Tickets Win, com cartaz, data, local e botão de compra.</span></div></div>
          <NewCampaign p={p} busy={busy} onCreate={(ev, m) => act(() => createEventCampaign(ev, m), "E-mail criado.")} onAdvanced={() => act(() => createCampaign("branco", ""), "Campanha criada.")} />
        </section>
      ) : (
        <section className="cx">
          <div className="card-h wrap2">
            <div><h2 className="card-t">Campanhas</h2><span className="card-s">{p.campaigns.length} no total</span></div>
            <div className="seg2 sm">
              {([["all", "Todas"], ["draft", "Rascunhos"], ["sent", "Enviadas"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "sg on" : "sg"} type="button" onClick={() => setFilter(k)}>{l}</button>)}
            </div>
          </div>
          <Tbl label="Campanhas">
            <div className="ml-row thd"><span>Campanha</span><span>Status</span><span className="num">Pessoas</span><span className="num">Abertura</span><span className="num">Cliques</span><span /></div>
            {shown.map((c) => (
              <div className="ml-row" key={c.id}>
                <Link className="ml-n" href={`/painel/emails/${c.id}`}><b>{c.name}</b><small>{c.subject || "Sem assunto"} · {c.when}</small></Link>
                <span className="ml-st"><span className={STATUS[c.status]?.[1] ?? "st draft"}><i />{STATUS[c.status]?.[0] ?? c.status}</span>{c.status === "sending" && <span className="bar sm"><i style={{ width: `${c.progress}%` }} /></span>}</span>
                <span className="num">{c.recipients ? n(c.recipients) : "—"}</span>
                <span className="num">{c.open}</span>
                <span className="num">{c.click}</span>
                <span className="ml-mn">
                  <button className="b2 icon" type="button" aria-label={`Mais ações de ${c.name}`} aria-expanded={menu === c.id} onClick={(e) => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id); }}>•••</button>
                  {menu === c.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <Link className="mn-i" href={`/painel/emails/${c.id}`}>{c.status === "sent" || c.status === "sending" ? "Ver relatório" : "Abrir"}</Link>
                      <button className="mn-i" type="button" disabled={busy} onClick={() => { setMenu(null); act(() => duplicateCampaign(c.id), "Campanha duplicada."); }}>Duplicar</button>
                      {c.status !== "sending" && <button className="mn-i danger" type="button" disabled={busy} onClick={() => { setMenu(null); act(() => deleteCampaign(c.id), "Campanha excluída."); }}>Excluir</button>}
                    </div>
                  )}
                </span>
              </div>
            ))}
            {!shown.length && <div className="empty2"><b className="em-t">Nada por aqui</b><span className="em-s">Nenhuma campanha neste filtro.</span></div>}
          </Tbl>
        </section>
      )}

      {picker && (
        <PainelPortal>
        <div className="ml-ov" role="dialog" aria-modal="true" aria-label="Nova campanha" onClick={() => setPicker(false)}>
          <div className="ml-dlg" onClick={(e) => e.stopPropagation()}>
            <div className="ml-dh"><div><h2 className="card-t">Novo e-mail</h2><span className="card-s">Escolha o evento e o motivo. Depois é só conferir e enviar.</span></div><button className="ln-x" type="button" aria-label="Fechar" onClick={() => setPicker(false)}>×</button></div>
            <NewCampaign p={p} busy={busy} onCreate={(ev, m) => act(() => createEventCampaign(ev, m), "E-mail criado.")} onAdvanced={() => act(() => createCampaign("branco", ""), "Campanha criada.")} />
            {p.saved.length > 0 && (
              <div className="ml-saved">
                <span className="ml-lbl">Seus modelos</span>
                {p.saved.map((t) => (
                  <div className="ml-sv" key={t.id}>
                    <button className="ml-svb" type="button" disabled={busy} onClick={() => act(() => createFromSaved(t.id), "Campanha criada.")}>{t.name}</button>
                    <button className="ln-x" type="button" aria-label={`Apagar o modelo ${t.name}`} disabled={busy} onClick={() => act(() => deleteTemplate(t.id), "Modelo apagado.")}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </PainelPortal>
      )}
    </div>
  );
}

/** Novo e-mail em dois passos: o evento e o motivo. O resto o modelo da Tickets Win monta sozinho. */
function NewCampaign({ p, busy, onCreate, onAdvanced }: { p: EmailsProps; busy: boolean; onCreate: (eventId: string, motive: Motive) => void; onAdvanced: () => void }) {
  const upcoming = p.events.filter((e) => !e.past);
  const [ev, setEv] = useState(upcoming[0]?.id ?? "");
  const [motive, setMotive] = useState<Motive>("novo");
  return (
    <div className="nc">
      <div className="nc-step"><span className="nc-n">1</span><b>Qual evento?</b></div>
      {upcoming.length ? (
        <div className="nc-evs" role="radiogroup" aria-label="Evento">
          {upcoming.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={ev === e.id} className={ev === e.id ? "nc-ev on" : "nc-ev"} onClick={() => setEv(e.id)}>
              <span className="nc-art"><FlyerArt id={e.flyerId} /></span>
              <span className="nc-et"><b>{e.title}</b><small>{e.when}</small></span>
              <i className="nc-ck" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : <div className="empty2"><b className="em-t">Nenhum evento à venda</b><span className="em-s">Publique um evento para mandar e-mails sobre ele.</span></div>}
      <div className="nc-step"><span className="nc-n">2</span><b>O que você quer avisar?</b></div>
      <div className="nc-mo" role="radiogroup" aria-label="Motivo">
        {(Object.entries(MOTIVES) as [Motive, (typeof MOTIVES)[Motive]][]).map(([k, m]) => (
          <button key={k} type="button" role="radio" aria-checked={motive === k} className={motive === k ? "nc-m on" : "nc-m"} onClick={() => setMotive(k)}>
            <b>{m.label}</b><small>{m.hint}</small>
          </button>
        ))}
      </div>
      <div className="nc-ft">
        <button className="nc-adv" type="button" onClick={onAdvanced} disabled={busy}>Prefere montar do zero? Abrir o editor avançado</button>
        <button className="b2 dark" type="button" disabled={!ev || busy} onClick={() => onCreate(ev, motive)}>{busy ? "Criando…" : "Continuar"}</button>
      </div>
    </div>
  );
}
