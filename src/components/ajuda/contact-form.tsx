"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Turnstile, useHuman } from "@/components/auth/turnstile";
import { sendContact, type ContactResult } from "@/lib/actions/contato";
import { CONTACT_SUBJECTS, HELP_EMAIL, type ContactSubject } from "@/lib/help/contact";
import { IcArrow, IcCheck } from "./icons";

type Field = "name" | "email" | "subject" | "order" | "message";

type Props = {
  /** chave pública do Turnstile (null = verificador desligado neste ambiente) */
  human: string | null;
  defaults: { name: string; email: string; subject: ContactSubject | ""; order: string; article: string };
};

const MAX_MSG = 4000;

/** Formulário de contato da central de ajuda (com o verificador de humanos da Cloudflare). */
export function ContactForm({ human, defaults }: Props) {
  const id = useId();
  const [name, setName] = useState(defaults.name);
  const [email, setEmail] = useState(defaults.email);
  const [subject, setSubject] = useState<ContactSubject | "">(defaults.subject);
  const [order, setOrder] = useState(defaults.order);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState<{ text: string; field?: Field } | null>(null);
  const [done, setDone] = useState<Extract<ContactResult, { ok: true }> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, start] = useTransition();
  const { token, setToken, ready } = useHuman(human);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!subject) { setErr({ text: "Escolha o assunto.", field: "subject" }); return; }
    setErr(null);
    start(async () => {
      const r = await sendContact({ name, email, subject, order, message, article: defaults.article, human: token, website }).catch(
        (): ContactResult => ({ ok: false, error: `Não conseguimos enviar agora. Tente de novo ou escreva para ${HELP_EMAIL}.` }),
      );
      // cada token do verificador vale uma vez só: pede outro para a próxima tentativa
      setAttempt((n) => n + 1);
      if (r.ok) { setDone(r); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      setErr({ text: r.error, field: r.field });
      if (r.field) document.getElementById(`${id}-${r.field}`)?.focus();
    });
  }

  if (done) {
    return (
      <div className="hp-ct-done" role="status">
        <span className="hp-ct-done-ic" aria-hidden="true"><IcCheck size={26} /></span>
        <h2>Mensagem enviada</h2>
        <p>
          Recebemos o seu contato e respondemos em até 1 dia útil
          {done.email ? <> no e-mail <b>{done.email}</b></> : null}. Guarde o protocolo para falar sobre este atendimento.
        </p>
        <div className="hp-ct-proto"><span>Protocolo</span><b>{done.protocol}</b></div>
        <div className="hp-ct-done-a">
          <Link className="btn-p" href="/ajuda">Voltar à central <IcArrow /></Link>
          <button className="btn-g" type="button" onClick={() => { setDone(null); setMessage(""); setOrder(""); }}>Enviar outra mensagem</button>
        </div>
      </div>
    );
  }

  const bad = (f: Field) => (err?.field === f ? true : undefined);
  const desc = (f: Field, extra?: string) => [err?.field === f ? `${id}-err` : "", extra ?? ""].filter(Boolean).join(" ") || undefined;
  const left = MAX_MSG - message.length;

  return (
    <form className="hp-ct-form" onSubmit={submit} noValidate aria-describedby={err && !err.field ? `${id}-err` : undefined}>
      <div className="hp-ct-row">
        <label className="hp-f" htmlFor={`${id}-name`}>
          <span className="hp-f-l">Nome</span>
          <input id={`${id}-name`} name="name" type="text" autoComplete="name" required minLength={2} maxLength={120}
            value={name} onChange={(e) => setName(e.target.value)} aria-invalid={bad("name")} aria-describedby={desc("name")} placeholder="Como você se chama" />
        </label>
        <label className="hp-f" htmlFor={`${id}-email`}>
          <span className="hp-f-l">E-mail</span>
          <input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254}
            value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={bad("email")} aria-describedby={desc("email", `${id}-email-h`)} placeholder="voce@exemplo.com" />
          <span className="hp-f-h" id={`${id}-email-h`}>A resposta chega neste e-mail. Use o da sua conta, se tiver.</span>
        </label>
      </div>
      <div className="hp-ct-row">
        <label className="hp-f" htmlFor={`${id}-subject`}>
          <span className="hp-f-l">Assunto</span>
          <span className="hp-sel">
            <select id={`${id}-subject`} name="subject" required value={subject} onChange={(e) => setSubject(e.target.value as ContactSubject)}
              aria-invalid={bad("subject")} aria-describedby={desc("subject")}>
              <option value="" disabled>Escolha um assunto</option>
              {(Object.keys(CONTACT_SUBJECTS) as ContactSubject[]).map((k) => <option key={k} value={k}>{CONTACT_SUBJECTS[k]}</option>)}
            </select>
          </span>
        </label>
        <label className="hp-f" htmlFor={`${id}-order`}>
          <span className="hp-f-l">Número do pedido <em>opcional</em></span>
          <input id={`${id}-order`} name="order" type="text" inputMode="numeric" autoComplete="off" maxLength={24}
            value={order} onChange={(e) => setOrder(e.target.value)} aria-invalid={bad("order")} aria-describedby={desc("order", `${id}-order-h`)} placeholder="Ex.: 48213" />
          <span className="hp-f-h" id={`${id}-order-h`}>Está no e-mail da compra e em Minha conta, Compras.</span>
        </label>
      </div>
      <label className="hp-f" htmlFor={`${id}-message`}>
        <span className="hp-f-l">Mensagem</span>
        <textarea id={`${id}-message`} name="message" required minLength={20} maxLength={MAX_MSG} rows={7}
          value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={bad("message")} aria-describedby={desc("message", `${id}-msg-h`)}
          placeholder="Conte o que aconteceu, o nome do evento e o que você já tentou." />
        <span className="hp-f-h hp-f-cnt" id={`${id}-msg-h`}>
          <span>Pelo menos 20 caracteres. Não envie senhas nem dados do cartão.</span>
          <span className={left < 200 ? "low" : undefined}>{left.toLocaleString("pt-BR")}</span>
        </span>
      </label>

      {/* campo isca: invisível para pessoas, preenchido por robôs */}
      <div className="hp-hp" aria-hidden="true">
        <label>Site<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      <Turnstile siteKey={human} action="contato" resetKey={attempt} onToken={setToken} />

      {err && <p className="hp-ct-err" id={`${id}-err`} role="alert">{err.text}</p>}

      <div className="hp-ct-send">
        <button className="btn-p" type="submit" disabled={pending || !ready} aria-busy={pending || !ready}>
          {pending ? "Enviando…" : ready ? <>Enviar mensagem <IcArrow /></> : "Verificando…"}
        </button>
        <p>Ao enviar, você concorda com a nossa <Link href="/legal/privacidade">Política de privacidade</Link>.</p>
      </div>
    </form>
  );
}
