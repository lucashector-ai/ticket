"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BrandLogo, BrandMark } from "@/components/brand-logo";
import { checkOrganizerName, finishOnboarding } from "@/lib/actions/onboarding";
import { AUDIENCE, KINDS, PER_YEAR } from "@/lib/onboarding";

type Step = 0 | 1 | 2 | 3 | 4;
const QUESTIONS: { title: string; options: readonly (readonly [string, string])[]; key: "kind" | "perYear" | "audience" }[] = [
  { title: "Que tipo de evento você vai lançar?", options: KINDS, key: "kind" },
  { title: "Quantos eventos você pretende fazer este ano?", options: PER_YEAR, key: "perYear" },
  { title: "Qual é o público médio dos seus eventos?", options: AUDIENCE, key: "audience" },
];

/** Cadastro do produtor em telas: nome público e três perguntas de um clique. */
export function ProducerOnboarding({ firstName, fullName, initialName }: { firstName: string; fullName: string; initialName: string }) {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState(initialName);
  const [terms, setTerms] = useState(false);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "taken"; slug: string }>({ state: "idle", slug: "" });
  const [ans, setAns] = useState({ kind: "", perYear: "", audience: "" });
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  // confere o nome enquanto a pessoa digita
  useEffect(() => {
    const v = name.trim();
    if (v.length < 2) return;
    const t = setTimeout(async () => {
      setCheck((c) => ({ ...c, state: "checking" }));
      const r = await checkOrganizerName(v);
      if (r.ok) setCheck({ state: r.available ? "ok" : "taken", slug: r.slug });
    }, 400);
    return () => clearTimeout(t);
  }, [name]);

  const nameOk = name.trim().length >= 2 && check.state === "ok";
  const pick = (key: "kind" | "perYear" | "audience", v: string) => {
    const next = { ...ans, [key]: v };
    setAns(next);
    setError("");
    if (step < 3) { setTimeout(() => setStep((s) => (s + 1) as Step), 220); return; }
    start(async () => {
      const r = await finishOnboarding({ name, ...next });
      if (!r.ok) { setError(r.error); if (r.error.includes("nome")) setStep(0); return; }
      setStep(4);
    });
  };

  return (
    <main className="pg-onb">
      <div className="ob-glow" aria-hidden="true" />
      <header className="ob-top">
        <Link href="/" className="ob-logo" aria-label="Tickets Win"><BrandLogo height={22} /></Link>
        {step > 0 && step < 4 && (
          <div className="ob-prog" aria-label={`Etapa ${step + 1} de 4`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        )}
        <span className="ob-sp" />
      </header>

      <div className="ob-wrap">
        <div className="ob-av" aria-hidden="true"><BrandMark size={44} /></div>

        {step === 0 && (
          <section className="ob-step" key="s0">
            <h1 className="ob-h">Prazer em te conhecer{firstName ? `, ${firstName}` : ""}.<br />Vamos montar o seu painel.</h1>
            <form className="ob-card" onSubmit={(e) => { e.preventDefault(); if (nameOk && terms) setStep(1); }}>
              <label className="ob-f">
                <span className="ob-l">Nome do organizador</span>
                <span className={`ob-in ${check.state === "taken" ? "bad" : nameOk ? "good" : ""}`}>
                  <input autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); if (e.target.value.trim().length < 2) setCheck({ state: "idle", slug: "" }); }} placeholder={fullName ? `Ex.: ${fullName.split(" ")[0]} Produções` : "Ex.: Noite Alta Produções"} aria-describedby="ob-hint" />
                  {nameOk && <i className="ob-ok" aria-label="Nome disponível"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></i>}
                </span>
              </label>
              <div className="ob-note" id="ob-hint">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z" /></svg>
                <span>{check.state === "taken" ? "Já existe um produtor com esse nome. Tente uma variação, como o nome da sua cidade junto." : <>É o nome público que aparece na Tickets Win. É assim que o público reconhece a sua marca, produtora ou casa de eventos.{nameOk && check.slug ? <> Sua página: <b>ticketswin.com.br/produtor/{check.slug}</b></> : null}</>}</span>
              </div>
              <div className="ob-2">
                <div className="ob-f"><span className="ob-l">País</span><span className="ob-sel"><svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true"><rect width="22" height="16" rx="3" fill="#229E45" /><path d="M11 2.2 19.4 8 11 13.8 2.6 8z" fill="#F8E509" /><circle cx="11" cy="8" r="3.4" fill="#2B49A3" /></svg>Brasil</span></div>
                <div className="ob-f"><span className="ob-l">Moeda</span><span className="ob-sel"><b>R$</b> BRL</span></div>
              </div>
              <label className="ob-terms">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                <span>Ao continuar, você concorda com os <Link href="/legal/termos" target="_blank">Termos de uso</Link> e a <Link href="/legal/privacidade" target="_blank">Política de privacidade</Link>.</span>
              </label>
              {error && <p className="ob-err" role="alert">{error}</p>}
              <button className="ob-go" type="submit" disabled={!nameOk || !terms}>Continuar</button>
            </form>
          </section>
        )}

        {step >= 1 && step <= 3 && (() => {
          const q = QUESTIONS[step - 1];
          return (
            <section className="ob-step" key={`s${step}`}>
              <p className="ob-eb">Vamos nos conhecer melhor,</p>
              <h1 className="ob-h">{q.title}</h1>
              <div className="ob-card ob-opts" role="radiogroup" aria-label={q.title}>
                {q.options.map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={ans[q.key] === k} className={ans[q.key] === k ? "ob-o on" : "ob-o"} onClick={() => pick(q.key, k)} disabled={busy}>
                    <i className="ob-r" aria-hidden="true" />{l}
                  </button>
                ))}
                {error && <p className="ob-err" role="alert">{error}</p>}
              </div>
              <button className="ob-back" type="button" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>Voltar
              </button>
            </section>
          );
        })()}

        {step === 4 && (
          <section className="ob-step" key="s4">
            <p className="ob-eb">Tudo pronto</p>
            <h1 className="ob-h">Bem-vindo à Tickets Win,<br /><span className="ob-acc">{name.trim()}.</span></h1>
            <p className="ob-sub">Seu painel já está no ar. Crie o primeiro evento e comece a vender: leva poucos minutos e você pode salvar como rascunho.</p>
            <div className="ob-done">
              <Link className="ob-go" href="/criar-evento">Criar meu primeiro evento</Link>
              <Link className="ob-ghost" href="/painel">Ir para o painel</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
