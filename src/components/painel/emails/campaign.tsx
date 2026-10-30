"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { audienceCount, duplicateCampaign, scheduleCampaign, sendNow, sendTest, unscheduleCampaign, updateCampaign } from "@/lib/actions/emails";
import { fillVars, needsEvent, reasonFor, SAMPLE_VARS, type Audience, type Design } from "@/lib/mail/design";
import { renderEmail, type EvInfo, type OrgInfo, type RenderCtx } from "@/lib/mail/render";
import { renderCampaign, type EventContent } from "@/lib/mail/event-email";
import { EventSetup } from "./event-setup";
import { useOrigin } from "../use-origin";
import { EmailEditor } from "./editor";
import { STATUS } from "./list";
import { Tbl } from "@/components/painel/tbl";

export type EvOpt = { id: string; title: string; when: string; past: boolean };
export type EditorData = { org: OrgInfo; events: Record<string, EvInfo>; upcoming: string[] };
export type CouponOpt = { code: string; eventId: string; label: string };

export type CampaignProps = {
  emailOn: boolean;
  userEmail: string;
  c: {
    id: string; name: string; status: string; format: "evento" | "livre"; content: EventContent | null; subject: string; preheader: string; fromName: string; replyTo: string;
    audience: Audience; design: Design; scheduledAt: string; scheduledLabel: string; sentLabel: string; tested: boolean;
  };
  count: number;
  events: EvOpt[];
  ctx: EditorData;
  coupons: CouponOpt[];
  report: null | {
    total: number; sent: number; queued: number; failed: number; opened: number; clicked: number; unsub: number;
    openPct: string; clickPct: string; unsubPct: string;
    links: { url: string; clicks: number }[];
    people: { email: string; name: string; status: string }[];
  };
};

const n = (v: number) => v.toLocaleString("pt-BR");

/** Contexto do HTML no navegador (prévia e editor). */
export function useRenderCtx(data: EditorData, preheader: string, audience: Audience): RenderCtx {
  const origin = useOrigin();
  const [now] = useState(() => Date.now());
  return useMemo(() => ({
    site: origin || "", org: data.org, events: data.events, upcoming: data.upcoming.map((id) => data.events[id]).filter(Boolean),
    vars: SAMPLE_VARS, preheader, reason: reasonFor(audience, data.org.name),
    unsubscribeUrl: "#", now,
  }), [origin, data, preheader, audience, now]);
}

/** Miniatura do e-mail (o HTML de verdade, reduzido). */
export function MailThumb({ html, scale = 0.7, height = 420 }: { html: string; scale?: number; height?: number }) {
  return (
    <div className="mc-th" style={{ height }}>
      <iframe title="Prévia do e-mail" srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" tabIndex={-1} style={{ width: `${100 / scale}%`, height: `${height / scale}px`, transform: `scale(${scale})` }} />
    </div>
  );
}

export function CampaignView(p: CampaignProps) {
  const sent = p.c.status === "sent" || p.c.status === "sending" || p.c.status === "cancelled";
  return sent ? <Report p={p} /> : p.c.format === "evento" ? <EventSetup p={p} /> : <Setup p={p} />;
}

/* ---------- montagem da campanha ---------- */

type Sec = "aud" | "from" | "subj" | "send" | null;

function Setup({ p }: { p: CampaignProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [f, setF] = useState({ name: p.c.name, subject: p.c.subject, preheader: p.c.preheader, fromName: p.c.fromName, replyTo: p.c.replyTo });
  const [aud, setAud] = useState<Audience>(p.c.audience);
  const [design, setDesign] = useState<Design>(p.c.design);
  const [count, setCount] = useState(p.count);
  const [counting, setCounting] = useState(false);
  const [open, setOpen] = useState<Sec>(null);
  const [editor, setEditor] = useState(false);
  const [saved, setSaved] = useState<"ok" | "saving" | "err">("ok");
  const [mode, setMode] = useState<"now" | "later">(p.c.scheduledAt ? "later" : "now");
  const [when, setWhen] = useState(p.c.scheduledAt);
  const [confirm, setConfirm] = useState(false);
  const [tested, setTested] = useState(p.c.tested);
  const scheduled = p.c.status === "scheduled";
  const subjRef = useRef<HTMLInputElement>(null);

  // salva os campos sozinho, um pouco depois de parar de digitar
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => {
      const r = await updateCampaign(p.c.id, { ...f, audience: aud });
      setSaved(r.ok ? "ok" : "err");
      if (!r.ok) flash(r.error);
    }, 800);
    return () => clearTimeout(t);
  }, [f, aud, p.c.id, flash]);
  // conta o público de novo quando ele muda
  const firstA = useRef(true);
  useEffect(() => {
    if (firstA.current) { firstA.current = false; return; }
    setCounting(true);
    const t = setTimeout(async () => {
      const r = await audienceCount(aud);
      if (r.ok) setCount(r.total);
      setCounting(false);
    }, 500);
    return () => clearTimeout(t);
  }, [aud]);

  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));
  const ctx = useRenderCtx(p.ctx, f.preheader, aud);
  const html = useMemo(() => renderEmail(design, ctx).html, [design, ctx]);

  /* revisão: o que impede e o que vale conferir */
  const missingEv = design.blocks.filter((b) => needsEvent(b) && (!("eventId" in b) || !b.eventId || !p.ctx.events[b.eventId]));
  const checks: { kind: "err" | "warn" | "ok"; text: string; fix?: () => void }[] = [];
  if (!count) checks.push({ kind: "err", text: "Nenhum destinatário com esse público", fix: () => setOpen("aud") });
  if (!f.subject.trim()) checks.push({ kind: "err", text: "Falta o assunto", fix: () => setOpen("subj") });
  if (!design.blocks.length) checks.push({ kind: "err", text: "O e-mail está vazio", fix: () => setEditor(true) });
  if (missingEv.length) checks.push({ kind: "err", text: `${missingEv.length === 1 ? "Um bloco está" : `${missingEv.length} blocos estão`} sem evento escolhido`, fix: () => setEditor(true) });
  if (design.blocks.some((b) => b.t === "cupom" && !b.code)) checks.push({ kind: "err", text: "O bloco de cupom está sem código", fix: () => setEditor(true) });
  if (!p.emailOn) checks.push({ kind: "warn", text: "O envio de e-mails está desligado no momento. Dá para montar e agendar: o agendado sai quando ele for ligado." });
  if (!f.preheader.trim()) checks.push({ kind: "warn", text: "Preencha o pré-cabeçalho (texto de prévia na caixa de entrada)", fix: () => setOpen("subj") });
  if (design.blocks.some((b) => b.t === "imagem" && !b.src)) checks.push({ kind: "warn", text: "Tem um bloco de imagem vazio (ele não aparece no envio)", fix: () => setEditor(true) });
  if (!tested) checks.push({ kind: "warn", text: "Envie um teste para você antes de disparar" });
  checks.push({ kind: "ok", text: "Link de descadastro incluído automaticamente" });
  checks.push({ kind: "ok", text: "Aberturas e cliques medidos, com UTM nos links do site" });
  const errs = checks.filter((x) => x.kind === "err").length;

  const test = () => start(async () => {
    const r = await sendTest(p.c.id);
    if (!r.ok) { flash(r.error); return; }
    setTested(true); flash(`Teste enviado para ${r.to}.`);
  });
  const go = () => start(async () => {
    if (mode === "later") {
      const r = await scheduleCampaign(p.c.id, when);
      if (!r.ok) { flash(r.error); return; }
      flash("Campanha agendada."); setConfirm(false); router.refresh();
      return;
    }
    const r = await sendNow(p.c.id);
    if (!r.ok) { flash(r.error); setConfirm(false); return; }
    flash(`Enviando para ${n(r.total)} pessoas.`); router.refresh();
  });
  const unschedule = () => start(async () => {
    const r = await unscheduleCampaign(p.c.id);
    if (!r.ok) flash(r.error); else { flash("Agendamento cancelado. A campanha voltou para rascunho."); router.refresh(); }
  });

  const audText = [
    aud.buyers === "all" ? "compradores de todos os eventos" : aud.buyers === "events" ? `compradores de ${aud.buyerEvents.length} ${aud.buyerEvents.length === 1 ? "evento" : "eventos"}` : "",
    aud.followers ? "seguidores" : "", aud.signups ? "listas de aviso e pré-venda" : "",
  ].filter(Boolean).join(" + ");

  return (
    <div className="pane">
      <div className="mc-top">
        <div className="mc-tl">
          <Link className="mc-back" href="/painel/emails"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>Campanhas</Link>
          <div className="mc-nr">
            <input autoComplete="off" className="mc-name" value={f.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nome da campanha" />
            <span className={scheduled ? "st warn" : "st draft"}><i />{scheduled ? `Agendada · ${p.c.scheduledLabel}` : "Rascunho"}</span>
            <span className="mc-sv" aria-live="polite">{saved === "saving" ? "Salvando…" : saved === "err" ? "Não salvou" : "Salvo"}</span>
          </div>
        </div>
        <div className="mc-ta">
          <button className="b2" type="button" onClick={test} disabled={busy}><Ico d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />Enviar teste</button>
        </div>
      </div>

      <div className="mc-cols">
        <div className="mc-main">
          <section className="mc-sec">
            <Row icon="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" tone="blue" done={count > 0}
              title="Destinatários" sub={<span className={count ? "" : "mc-bad"}>{counting ? "Contando…" : `${n(count)} ${count === 1 ? "pessoa" : "pessoas"}`} · {audText || "nenhuma fonte escolhida"}</span>}
              open={open === "aud"} onToggle={() => setOpen(open === "aud" ? null : "aud")} />
            {open === "aud" && <AudienceEdit aud={aud} setAud={setAud} events={p.events} count={count} counting={counting} />}
          </section>

          <section className="mc-sec">
            <Row icon="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" tone="blue" done={!!f.fromName}
              title="Remetente" sub={<>{f.fromName || "Sem nome"}{f.replyTo ? ` · respostas para ${f.replyTo}` : ""}</>}
              open={open === "from"} onToggle={() => setOpen(open === "from" ? null : "from")} />
            {open === "from" && (
              <div className="mc-body frm">
                <div className="mc-2">
                  <label className="fld"><span>Nome de quem envia</span><input autoComplete="off" value={f.fromName} maxLength={80} onChange={(e) => set({ fromName: e.target.value })} /><small>É o nome que aparece na caixa de entrada.</small></label>
                  <label className="fld"><span>Respostas vão para</span><input autoComplete="off" type="email" value={f.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="contato@suaprodutora.com" /><small>Quando a pessoa responder o e-mail.</small></label>
                </div>
              </div>
            )}
          </section>

          <section className="mc-sec">
            <Row icon="M4 7V5h16v2M9 19h6M12 5v14" tone="purple" done={!!f.subject.trim()}
              title="Assunto" sub={f.subject ? <>{fillVars(f.subject, SAMPLE_VARS)}</> : <span className="mc-warn">Escreva o assunto e o pré-cabeçalho</span>}
              open={open === "subj"} onToggle={() => setOpen(open === "subj" ? null : "subj")} />
            {open === "subj" && (
              <div className="mc-body frm">
                <label className="fld"><span>Assunto do e-mail</span>
                  <span className="mc-in">
                    <input autoComplete="off" ref={subjRef} autoFocus={!f.subject} value={f.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} placeholder="Ex.: {{primeiro_nome}}, vem aí o Halloween" />
                    <span className="mc-cnt">{f.subject.length}</span>
                    <button type="button" className="mc-var" onClick={() => { set({ subject: `${f.subject}{{primeiro_nome}}` }); subjRef.current?.focus(); }}>+ Nome</button>
                  </span>
                </label>
                <label className="fld"><span>Pré-cabeçalho</span><input autoComplete="off" value={f.preheader} maxLength={150} onChange={(e) => set({ preheader: e.target.value })} placeholder="Texto curto que aparece depois do assunto na caixa de entrada" /></label>
                <small className="mc-hint">Use {"{{primeiro_nome}}"} ou {"{{nome}}"} para personalizar. Sem nome cadastrado, use uma reserva: {"{{primeiro_nome|pessoal}}"}.</small>
                <div className="mc-inbox" aria-label="Como aparece na caixa de entrada">
                  <span className="mc-av">{(f.fromName || "P").slice(0, 2).toUpperCase()}</span>
                  <span className="mc-ib"><b>{f.fromName || "Produtor"}</b><span><b>{fillVars(f.subject || "Assunto do e-mail", SAMPLE_VARS)}</b> — {fillVars(f.preheader || "texto de prévia", SAMPLE_VARS)}</span></span>
                  <span className="mc-now">agora</span>
                </div>
              </div>
            )}
          </section>

          <section className="mc-sec">
            <Row icon="M3 4h18v6H3zM3 14h8v6H3zM15 14h6v6h-6z" tone="orange" done={design.blocks.length > 0 && !missingEv.length}
              title="Conteúdo do e-mail" sub={design.blocks.length ? `${design.blocks.length} blocos` : <span className="mc-warn">E-mail vazio: abra o editor para montar</span>}
              action={<button className="b2 dark" type="button" onClick={() => setEditor(true)}><Ico d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />Editar e-mail</button>} />
            <div className="mc-body mc-prev">
              <button className="mc-thb" type="button" onClick={() => setEditor(true)} aria-label="Abrir o editor do e-mail"><MailThumb html={html} /></button>
            </div>
          </section>

          <section className="mc-sec">
            <Row icon="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" tone="green" done
              title="Envio" sub={scheduled ? `Agendado para ${p.c.scheduledLabel}` : mode === "now" ? "Envia assim que você confirmar" : when ? `Agendar para ${when.replace("T", " às ")}` : "Escolha a data e a hora"}
              open={open === "send"} onToggle={() => setOpen(open === "send" ? null : "send")} />
            {open === "send" && (
              <div className="mc-body frm">
                <div className="seg2">
                  <button className={mode === "now" ? "sg on" : "sg"} type="button" onClick={() => setMode("now")}>Enviar agora</button>
                  <button className={mode === "later" ? "sg on" : "sg"} type="button" onClick={() => setMode("later")}>Agendar</button>
                </div>
                {mode === "later" && <label className="fld"><span>Data e hora (Brasília)</span><input autoComplete="off" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><small>Bons horários para evento: terça a quinta, entre 11h e 13h ou 18h e 20h.</small></label>}
                {scheduled && <button className="b2" type="button" onClick={unschedule} disabled={busy}>Cancelar agendamento</button>}
              </div>
            )}
          </section>
        </div>

        <aside className="mc-side">
          <section className="mc-rv">
            <div className="mc-rh"><span className="mc-ri"><Ico d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M9 12l2 2 4-4" /></span><h2 className="card-t">Revisar e enviar</h2></div>
            <ul className="mc-ck">
              {checks.map((x, i) => (
                <li key={i} className={x.kind}>
                  <span className="mc-ci" aria-hidden="true">{x.kind === "ok" ? "✓" : x.kind === "err" ? "×" : "!"}</span>
                  <span>{x.text}{x.fix && <> <button type="button" className="mc-fix" onClick={x.fix}>corrigir</button></>}</span>
                </li>
              ))}
            </ul>
            {errs > 0 && <div className="mc-cnt2">{errs} {errs === 1 ? "item impede" : "itens impedem"} o envio.</div>}
            <button className="b2 block" type="button" onClick={test} disabled={busy}><Ico d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />Enviar teste para mim</button>
            {!confirm ? (
              <button className="b2 dark block mc-go" type="button" disabled={busy || errs > 0 || (mode === "later" && !when) || (mode === "now" && !p.emailOn)} onClick={() => setConfirm(true)}>
                <Ico d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />{mode === "now" ? `Enviar agora (${n(count)})` : scheduled ? "Mudar o agendamento" : "Agendar envio"}
              </button>
            ) : (
              <div className="mc-cf">
                <b>{mode === "now" ? `Enviar para ${n(count)} ${count === 1 ? "pessoa" : "pessoas"}?` : `Agendar para ${when.replace("T", " às ")}?`}</b>
                <span>{mode === "now" ? "Depois de enviado, não dá para desfazer." : "Até lá você pode editar ou cancelar."}</span>
                <div className="mc-cfa">
                  <button className="b2" type="button" onClick={() => setConfirm(false)} disabled={busy}>Voltar</button>
                  <button className="b2 dark" type="button" onClick={go} disabled={busy}>{busy ? "Enviando…" : mode === "now" ? "Confirmar envio" : "Confirmar"}</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {editor && (
        <EmailEditor
          campaignId={p.c.id} name={f.name} design={design} data={p.ctx} events={p.events} coupons={p.coupons}
          preheader={f.preheader} audience={aud}
          onChange={setDesign} onClose={() => setEditor(false)} onTest={test} testing={busy}
        />
      )}
    </div>
  );
}

export function Ico({ d }: { d: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function Row({ icon, tone, done, title, sub, open, onToggle, action }: { icon: string; tone: string; done: boolean; title: string; sub: React.ReactNode; open?: boolean; onToggle?: () => void; action?: React.ReactNode }) {
  return (
    <div className="mc-row">
      <span className={`mc-ic ${tone}`}><Ico d={icon} />{done && <i className="mc-ok" aria-label="Pronto">✓</i>}</span>
      <div className="mc-rt"><b>{title}</b><span>{sub}</span></div>
      <div className="mc-ra">{action}{onToggle && <button className="b2" type="button" onClick={onToggle} aria-expanded={open}>{open ? "Fechar" : "Editar"}</button>}</div>
    </div>
  );
}

/** Quem recebe: fontes e exclusões, com a contagem ao vivo. */
export function AudienceEdit({ aud, setAud, events, count, counting }: { aud: Audience; setAud: (a: Audience) => void; events: EvOpt[]; count: number; counting: boolean }) {
  const set = (x: Partial<Audience>) => setAud({ ...aud, ...x });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div className="mc-body mc-aud">
      <div className="mc-src">
        <div className="mc-so">
          <div className="mc-sh"><b>Compradores</b><small>Quem já comprou ingresso com você.</small></div>
          <div className="seg2 sm">
            {([["all", "Todos os eventos"], ["events", "Escolher eventos"], ["none", "Não incluir"]] as const).map(([k, l]) => <button key={k} className={aud.buyers === k ? "sg on" : "sg"} type="button" onClick={() => set({ buyers: k })}>{l}</button>)}
          </div>
          {aud.buyers === "events" && (
            <div className="mc-chips">
              {events.map((e) => <button key={e.id} type="button" className={aud.buyerEvents.includes(e.id) ? "mc-chip on" : "mc-chip"} onClick={() => set({ buyerEvents: toggle(aud.buyerEvents, e.id) })}>{e.title}<small>{e.when}</small></button>)}
              {!events.length && <small className="mc-hint">Nenhum evento publicado ainda.</small>}
            </div>
          )}
        </div>
        <label className="tg2"><span><b>Seguidores da sua página</b><small>Quem segue você na Tickets Win.</small></span><input className="sr" type="checkbox" checked={aud.followers} onChange={(e) => set({ followers: e.target.checked })} /><span className="sw" aria-hidden="true" /></label>
        <label className="tg2"><span><b>Listas de aviso e pré-venda</b><small>Quem deixou o e-mail no “Me avise” ou no cadastro da pré-venda.</small></span><input className="sr" type="checkbox" checked={aud.signups} onChange={(e) => set({ signups: e.target.checked })} /><span className="sw" aria-hidden="true" /></label>
      </div>
      <div className="mc-so">
        <div className="mc-sh"><b>Não enviar para quem já comprou</b><small>Ótimo para anunciar um evento só para quem ainda não garantiu o ingresso.</small></div>
        <div className="mc-chips">
          {events.filter((e) => !e.past).map((e) => <button key={e.id} type="button" className={aud.excludeBuyersOf.includes(e.id) ? "mc-chip on x" : "mc-chip"} onClick={() => set({ excludeBuyersOf: toggle(aud.excludeBuyersOf, e.id) })}>{e.title}<small>{e.when}</small></button>)}
        </div>
      </div>
      <div className="mc-total"><b>{counting ? "…" : n(count)}</b><span>{count === 1 ? "pessoa recebe" : "pessoas recebem"}. Repetidos contam uma vez e quem se descadastrou fica de fora.</span></div>
    </div>
  );
}

/* ---------- relatório ---------- */

const PST: Record<string, [string, string]> = { click: ["Clicou", "st on"], open: ["Abriu", "st on"], sent: ["Recebeu", "st draft"], queued: ["Na fila", "st soft"], failed: ["Falhou", "st off"], unsub: ["Descadastrou", "st warn"] };

function Report({ p }: { p: CampaignProps }) {
  const r = p.report!;
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<"all" | "open" | "click" | "no" | "unsub">("all");
  const ctx = useRenderCtx(p.ctx, p.c.preheader, p.c.audience);
  const html = useMemo(() => renderCampaign({ format: p.c.format, content: p.c.content, design: p.c.design }, ctx).html, [p.c.format, p.c.content, p.c.design, ctx]);
  useEffect(() => {
    if (p.c.status !== "sending") return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [p.c.status, router]);
  const people = r.people.filter((x) => tab === "all" || (tab === "open" ? x.status === "open" || x.status === "click" : tab === "click" ? x.status === "click" : tab === "unsub" ? x.status === "unsub" : x.status === "sent"));
  const dup = () => start(async () => {
    const x = await duplicateCampaign(p.c.id);
    if (!x.ok) { flash(x.error); return; }
    router.push(`/painel/emails/${x.id}`);
  });
  const prog = r.total ? Math.round(((r.total - r.queued) / r.total) * 100) : 0;
  return (
    <div className="pane">
      <div className="mc-top">
        <div className="mc-tl">
          <Link className="mc-back" href="/painel/emails"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>Campanhas</Link>
          <div className="mc-nr"><h1 className="mc-name as-h">{p.c.name}</h1><span className={STATUS[p.c.status]?.[1] ?? "st draft"}><i />{STATUS[p.c.status]?.[0]}</span></div>
          <span className="mc-sub">“{fillVars(p.c.subject, SAMPLE_VARS)}” · {p.c.status === "sending" ? `começou ${p.c.sentLabel}` : `enviada ${p.c.sentLabel}`}</span>
        </div>
        <div className="mc-ta"><button className="b2" type="button" onClick={dup} disabled={busy}>Duplicar campanha</button></div>
      </div>
      {p.c.status === "sending" && (
        <div className="mc-prog"><span>Enviando: {n(r.total - r.queued)} de {n(r.total)}</span><span className="bar"><i style={{ width: `${prog}%` }} /></span></div>
      )}
      <div className="kpis">
        <div className="kpi"><span className="kp-l">Entregues</span><b className="kp-v">{n(r.sent)}</b><div className="kp-f"><span className="kp-n">{r.failed ? `${n(r.failed)} falharam` : `de ${n(r.total)} na lista`}</span></div></div>
        <div className="kpi"><span className="kp-l">Abriram</span><b className="kp-v">{r.openPct}</b><div className="kp-f"><span className="kp-n">{n(r.opened)} {r.opened === 1 ? "pessoa" : "pessoas"}</span></div></div>
        <div className="kpi"><span className="kp-l">Clicaram</span><b className="kp-v">{r.clickPct}</b><div className="kp-f"><span className="kp-n">{n(r.clicked)} {r.clicked === 1 ? "pessoa" : "pessoas"}</span></div></div>
        <div className="kpi"><span className="kp-l">Descadastros</span><b className="kp-v">{n(r.unsub)}</b><div className="kp-f"><span className="kp-n">{r.sent ? `${r.unsubPct} de quem recebeu` : "pelo link do e-mail"}</span></div></div>
      </div>
      <div className="mc-cols">
        <div className="mc-main">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Links mais clicados</h2><span className="card-s">Cliques no e-mail, por endereço</span></div></div>
            <Tbl label="Links mais clicados">
              {r.links.map((l, i) => <div className="mc-lk" key={i}><span className="mc-lu" title={l.url}>{l.url.replace(/^https?:\/\//, "")}</span><b>{n(l.clicks)}</b></div>)}
              {!r.links.length && <div className="empty2"><span className="em-s">Este e-mail não tem links.</span></div>}
            </Tbl>
          </section>
          <section className="cx">
            <div className="card-h wrap2">
              <div><h2 className="card-t">Quem recebeu</h2><span className="card-s">{r.total > r.people.length ? `Mostrando ${n(r.people.length)} de ${n(r.total)}` : `${n(r.total)} pessoas`}</span></div>
              <div className="seg2 sm">{([["all", "Todos"], ["open", "Abriram"], ["click", "Clicaram"], ["no", "Não abriram"], ["unsub", "Saíram"]] as const).map(([k, l]) => <button key={k} className={tab === k ? "sg on" : "sg"} type="button" onClick={() => setTab(k)}>{l}</button>)}</div>
            </div>
            <Tbl label="Quem recebeu">
              {people.slice(0, 200).map((x, i) => <div className="ln-row mc-pr" key={i}><span className="ln-e">{x.name || x.email}<small>{x.name ? x.email : ""}</small></span><span className={PST[x.status]?.[1] ?? "st draft"}>{PST[x.status]?.[0] ?? x.status}</span></div>)}
              {!people.length && <div className="empty2"><span className="em-s">Ninguém neste filtro.</span></div>}
            </Tbl>
          </section>
        </div>
        <aside className="mc-side"><section className="cx"><div className="card-h"><h2 className="card-t">O e-mail</h2></div><MailThumb html={html} scale={0.46} height={560} /></section></aside>
      </div>
    </div>
  );
}
