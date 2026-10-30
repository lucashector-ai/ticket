"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { audienceCount, scheduleCampaign, sendNow, sendTest, unscheduleCampaign, updateCampaign } from "@/lib/actions/emails";
import { fillVars, SAMPLE_VARS, type Audience } from "@/lib/mail/design";
import { defaultPreheader, MOTIVES, renderEventEmail, type EventContent, type Motive } from "@/lib/mail/event-email";
import { AudienceEdit, Ico, Row, useRenderCtx, type CampaignProps } from "./campaign";

const n = (v: number) => v.toLocaleString("pt-BR");

/** Campanha no modelo pronto: evento, motivo, recado, público e envio, com a prévia ao lado. */
export function EventSetup({ p }: { p: CampaignProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [f, setF] = useState({ name: p.c.name, subject: p.c.subject, preheader: p.c.preheader, fromName: p.c.fromName, replyTo: p.c.replyTo });
  const [aud, setAud] = useState<Audience>(p.c.audience);
  const [ct, setCt] = useState<EventContent>(p.c.content ?? { eventId: "", motive: "novo", message: "", coupon: "" });
  const [count, setCount] = useState(p.count);
  const [counting, setCounting] = useState(false);
  const [openAud, setOpenAud] = useState(false);
  const [openFrom, setOpenFrom] = useState(false);
  const [saved, setSaved] = useState<"ok" | "saving" | "err">("ok");
  const [mode, setMode] = useState<"now" | "later">(p.c.scheduledAt ? "later" : "now");
  const [when, setWhen] = useState(p.c.scheduledAt);
  const [confirm, setConfirm] = useState(false);
  const [tested, setTested] = useState(p.c.tested);
  const [device, setDevice] = useState<"desk" | "mob">("desk");
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const scheduled = p.c.status === "scheduled";

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    const t = setTimeout(async () => {
      const r = await updateCampaign(p.c.id, { ...f, audience: aud, content: ct });
      setSaved(r.ok ? "ok" : "err");
      if (!r.ok) flash(r.error);
    }, 700);
    return () => clearTimeout(t);
  }, [f, aud, ct, p.c.id, flash]);
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
  const ev = p.ctx.events[ct.eventId];
  const subjectFor = (m: Motive, id = ct.eventId) => { const e = p.ctx.events[id]; return e ? MOTIVES[m].subject(e.title, e.whenShort) : ""; };
  /** troca evento ou motivo: o assunto acompanha, se a pessoa ainda não escreveu um próprio */
  const change = (patch: Partial<EventContent>) => {
    const next = { ...ct, ...patch };
    if (f.subject === subjectFor(ct.motive) || !f.subject) set({ subject: subjectFor(next.motive, next.eventId) });
    setCt(next);
  };

  const ctx = useRenderCtx(p.ctx, f.preheader, aud);
  const html = useMemo(() => renderEventEmail(ct, { ...ctx, unsubscribeUrl: "#", vars: SAMPLE_VARS }).html, [ct, ctx]);
  const coupons = p.coupons.filter((c) => !c.eventId || c.eventId === ct.eventId);

  const checks: { kind: "err" | "warn" | "ok"; text: string }[] = [];
  if (!ev) checks.push({ kind: "err", text: "Escolha o evento" });
  if (!count) checks.push({ kind: "err", text: "Ninguém recebe com esse público" });
  if (!f.subject.trim()) checks.push({ kind: "err", text: "Falta o assunto" });
  if (ct.motive === "cupom" && !ct.coupon) checks.push({ kind: "err", text: "Escolha o cupom" });
  if (!p.emailOn) checks.push({ kind: "warn", text: "O envio de e-mails está desligado no momento. Dá para montar e agendar: o agendado sai quando ele for ligado." });
  if (!tested) checks.push({ kind: "warn", text: "Mande um teste para você antes" });
  checks.push({ kind: "ok", text: ct.message.trim() ? "Seu recado entra depois das informações do evento" : "Sem recado: o e-mail usa a descrição do evento" });
  checks.push({ kind: "ok", text: "Descadastro, rodapé e marca Tickets Win incluídos" });
  const errs = checks.filter((x) => x.kind === "err").length;

  const test = () => start(async () => {
    await updateCampaign(p.c.id, { ...f, audience: aud, content: ct });
    const r = await sendTest(p.c.id);
    if (!r.ok) { flash(r.error); return; }
    setTested(true); flash(`Teste enviado para ${r.to}.`);
  });
  const go = () => start(async () => {
    await updateCampaign(p.c.id, { ...f, audience: aud, content: ct });
    if (mode === "later") {
      const r = await scheduleCampaign(p.c.id, when);
      if (!r.ok) { flash(r.error); return; }
      flash("Envio agendado."); setConfirm(false); router.refresh();
      return;
    }
    const r = await sendNow(p.c.id);
    if (!r.ok) { flash(r.error); setConfirm(false); return; }
    flash(`Enviando para ${n(r.total)} pessoas.`); router.refresh();
  });
  const unschedule = () => start(async () => {
    const r = await unscheduleCampaign(p.c.id);
    if (!r.ok) flash(r.error); else { flash("Agendamento cancelado."); router.refresh(); }
  });
  const addName = () => {
    const el = msgRef.current, at = el?.selectionStart ?? ct.message.length;
    change({ message: `${ct.message.slice(0, at)}{{primeiro_nome}}${ct.message.slice(at)}` });
    requestAnimationFrame(() => el?.focus());
  };

  const audText = [
    aud.buyers === "all" ? "compradores de todos os eventos" : aud.buyers === "events" ? `compradores de ${aud.buyerEvents.length} ${aud.buyerEvents.length === 1 ? "evento" : "eventos"}` : "",
    aud.followers ? "seguidores" : "", aud.signups ? "listas de aviso" : "",
  ].filter(Boolean).join(", ");
  const upcoming = p.events.filter((e) => !e.past);

  return (
    <div className="pane">
      <div className="mc-top">
        <div className="mc-tl">
          <Link className="mc-back" href="/painel/emails"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>E-mails</Link>
          <div className="mc-nr">
            <input autoComplete="off" className="mc-name" value={f.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do e-mail (só você vê)" />
            <span className={scheduled ? "st warn" : "st draft"}><i />{scheduled ? `Agendado · ${p.c.scheduledLabel}` : "Rascunho"}</span>
            <span className="mc-sv" aria-live="polite">{saved === "saving" ? "Salvando…" : saved === "err" ? "Não salvou" : "Salvo"}</span>
          </div>
        </div>
      </div>

      <div className="mc-cols ev">
        <div className="mc-main">
          <section className="mc-sec">
            <div className="es-h"><span className="es-n">1</span><div><b>Evento e motivo</b><span>O e-mail sai no formato da Tickets Win, com cartaz, data, local, preço e botão de compra.</span></div></div>
            <div className="es-b frm">
              <label className="fld"><span>Evento</span>
                <select value={ct.eventId} onChange={(e) => change({ eventId: e.target.value })}>
                  {!ct.eventId && <option value="">Escolha o evento</option>}
                  {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.when}</option>)}
                  {ev && !upcoming.some((e) => e.id === ct.eventId) && <option value={ct.eventId}>{ev.title}</option>}
                </select>
              </label>
              <div className="fld"><span>Motivo</span>
                <div className="es-mo" role="radiogroup" aria-label="Motivo">
                  {(Object.entries(MOTIVES) as [Motive, (typeof MOTIVES)[Motive]][]).map(([k, m]) => (
                    <button key={k} type="button" role="radio" aria-checked={ct.motive === k} className={ct.motive === k ? "nc-m on" : "nc-m"} onClick={() => change({ motive: k })}><b>{m.label}</b><small>{m.hint}</small></button>
                  ))}
                </div>
              </div>
              {ct.motive === "cupom" && (
                <label className="fld"><span>Cupom</span>
                  {coupons.length ? (
                    <select value={ct.coupon} onChange={(e) => change({ coupon: e.target.value })}>
                      <option value="">Escolha o cupom</option>
                      {coupons.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label} de desconto</option>)}
                    </select>
                  ) : <span className="es-empty">Você ainda não tem cupom ativo para este evento. <Link href="/painel/marketing">Criar cupom em Marketing</Link></span>}
                  <small>O botão do e-mail já abre o evento com o cupom aplicado.</small>
                </label>
              )}
            </div>
          </section>

          <section className="mc-sec">
            <div className="es-h"><span className="es-n">2</span><div><b>Recado para o público</b><span>Opcional. Aparece depois das informações do evento. Sem recado, usamos a descrição do evento.</span></div></div>
            <div className="es-b frm">
              <div className="es-ta">
                <textarea ref={msgRef} rows={6} maxLength={4000} value={ct.message} onChange={(e) => change({ message: e.target.value })}
                  placeholder={"Ex.: Oi {{primeiro_nome}}, a virada de lote é na sexta. Garanta o seu antes que o preço suba!\n\nNos vemos na pista."} aria-label="Recado" />
                <div className="es-tab"><button type="button" className="mc-var" onClick={addName}>+ Nome da pessoa</button><span className="mc-cnt">{ct.message.length}/4000</span></div>
              </div>
            </div>
          </section>

          <section className="mc-sec">
            <div className="es-h"><span className="es-n">3</span><div><b>Assunto</b><span>É o que a pessoa lê na caixa de entrada.</span></div></div>
            <div className="es-b frm">
              <label className="fld"><span className="sr">Assunto</span>
                <span className="mc-in"><input autoComplete="off" value={f.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} placeholder="Assunto do e-mail" /><span className="mc-cnt">{f.subject.length}</span><button type="button" className="mc-var" onClick={() => set({ subject: `{{primeiro_nome}}, ${f.subject}` })}>+ Nome</button></span>
              </label>
              <div className="mc-inbox" aria-label="Como aparece na caixa de entrada">
                <span className="mc-av">{(f.fromName || "P").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}</span>
                <span className="mc-ib"><b>{f.fromName || "Produtor"}</b><span><b>{fillVars(f.subject || "Assunto do e-mail", SAMPLE_VARS)}</b> — {fillVars(f.preheader || (ev ? defaultPreheader(ev) : ""), SAMPLE_VARS)}</span></span>
                <span className="mc-now">agora</span>
              </div>
            </div>
          </section>

          <section className="mc-sec">
            <Row icon="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" tone="" done={count > 0}
              title="Quem recebe" sub={<span className={count ? "" : "mc-bad"}>{counting ? "Contando…" : `${n(count)} ${count === 1 ? "pessoa" : "pessoas"}`} · {audText || "nenhuma fonte escolhida"}{aud.excludeBuyersOf.length ? " · sem quem já comprou" : ""}</span>}
              open={openAud} onToggle={() => setOpenAud(!openAud)} />
            {openAud && <AudienceEdit aud={aud} setAud={setAud} events={p.events} count={count} counting={counting} />}
          </section>

          <section className="mc-sec">
            <Row icon="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" tone="" done={!!f.fromName}
              title="Remetente" sub={<>{f.fromName || "Sem nome"}{f.replyTo ? ` · respostas para ${f.replyTo}` : ""}</>}
              open={openFrom} onToggle={() => setOpenFrom(!openFrom)} />
            {openFrom && (
              <div className="mc-body frm">
                <div className="mc-2">
                  <label className="fld"><span>Nome de quem envia</span><input autoComplete="off" value={f.fromName} maxLength={80} onChange={(e) => set({ fromName: e.target.value })} /></label>
                  <label className="fld"><span>Respostas vão para</span><input autoComplete="off" type="email" value={f.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="contato@suaprodutora.com" /></label>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="mc-side es-side">
          <section className="es-pv">
            <div className="es-pvh"><b>Prévia</b>
              <div className="seg2 sm"><button className={device === "desk" ? "sg on" : "sg"} type="button" onClick={() => setDevice("desk")}>Computador</button><button className={device === "mob" ? "sg on" : "sg"} type="button" onClick={() => setDevice("mob")}>Celular</button></div>
            </div>
            <div className={`es-frame ${device}`}>
              <iframe title="Prévia do e-mail" srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" tabIndex={-1} />
            </div>
          </section>

          <section className="mc-rv">
            <div className="mc-rh"><span className="mc-ri"><Ico d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M9 12l2 2 4-4" /></span><h2 className="card-t">Revisar e enviar</h2></div>
            <ul className="mc-ck">
              {checks.map((x, i) => <li key={i} className={x.kind}><span className="mc-ci" aria-hidden="true">{x.kind === "ok" ? "✓" : x.kind === "err" ? "×" : "!"}</span><span>{x.text}</span></li>)}
            </ul>
            <div className="seg2 es-when">
              <button className={mode === "now" ? "sg on" : "sg"} type="button" onClick={() => setMode("now")}>Enviar agora</button>
              <button className={mode === "later" ? "sg on" : "sg"} type="button" onClick={() => setMode("later")}>Agendar</button>
            </div>
            {mode === "later" && <label className="fld"><span>Data e hora (Brasília)</span><input autoComplete="off" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>}
            {scheduled && <button className="b2" type="button" onClick={unschedule} disabled={busy}>Cancelar agendamento</button>}
            <button className="b2 block" type="button" onClick={test} disabled={busy || !ev}><Ico d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />Enviar teste para mim</button>
            {!confirm ? (
              <button className="b2 dark block mc-go" type="button" disabled={busy || errs > 0 || (mode === "later" && !when) || (mode === "now" && !p.emailOn)} onClick={() => setConfirm(true)}>
                <Ico d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />{mode === "now" ? `Enviar para ${n(count)} ${count === 1 ? "pessoa" : "pessoas"}` : scheduled ? "Mudar o agendamento" : "Agendar envio"}
              </button>
            ) : (
              <div className="mc-cf">
                <b>{mode === "now" ? `Enviar para ${n(count)} ${count === 1 ? "pessoa" : "pessoas"}?` : `Agendar para ${when.replace("T", " às ")}?`}</b>
                <span>{mode === "now" ? "Depois de enviado, não dá para desfazer." : "Até lá você pode mudar ou cancelar."}</span>
                <div className="mc-cfa">
                  <button className="b2" type="button" onClick={() => setConfirm(false)} disabled={busy}>Voltar</button>
                  <button className="b2 dark" type="button" onClick={go} disabled={busy}>{busy ? "Enviando…" : mode === "now" ? "Confirmar envio" : "Confirmar"}</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
