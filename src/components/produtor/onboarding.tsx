"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { checkOrganizerName, finishOnboarding } from "@/lib/actions/onboarding";
import { CitySelect, UfSelect } from "@/components/city-select";

type Init = { name: string; city: string; uf: string; instagram: string; tagline: string };
type Result = { ok: true; slug: string } | { ok: false; error: string };
/**
 * `nova`: segunda (ou terceira) produtora de quem já é produtor, no painel: outros textos, sem os termos (já
 * aceitos) e a ação que cria e ativa a produtora nova no lugar da que conclui o cadastro.
 */
type Props = { firstName: string; initial: Init; ufs: readonly string[]; nova?: { create: (f: Init) => Promise<Result>; owned: number; max: number } };

const initialsOf = (n: string) => n.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "TW";

/**
 * Cadastro do produtor aprovado: o nome público e como as pessoas te encontram,
 * com a página do produtor aparecendo ao vivo do lado.
 */
export function ProducerOnboarding({ firstName, initial, nova }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [f, setF] = useState(initial);
  const [terms, setTerms] = useState(!!nova);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "taken"; slug: string }>({ state: "idle", slug: "" });
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const set = (patch: Partial<Init>) => { setF((o) => ({ ...o, ...patch })); setError(""); };

  // confere o nome enquanto a pessoa digita
  useEffect(() => {
    const v = f.name.trim();
    if (v.length < 2) return;
    const t = setTimeout(async () => {
      setCheck((c) => ({ ...c, state: "checking" }));
      const r = await checkOrganizerName(v);
      if (r.ok) setCheck({ state: r.available ? "ok" : "taken", slug: r.slug });
    }, 400);
    return () => clearTimeout(t);
  }, [f.name]);

  const nameOk = f.name.trim().length >= 2 && check.state === "ok";
  function finish() {
    start(async () => {
      const r = nova ? await nova.create(f) : await finishOnboarding(f);
      if (!r.ok) { setError(r.error); if (r.error.includes("nome")) setStep(0); return; }
      setCheck((c) => ({ ...c, slug: r.slug }));
      setStep(2);
    });
  }

  return (
    <main className="pg-onb">
      <header className="ob-top">
        <Link href={nova ? "/painel" : "/"} className="ob-logo" aria-label={nova ? "Tickets Win: voltar ao painel" : "Tickets Win"}><BrandLogo height={22} /></Link>
        <ol className="ob-steps" aria-label="Etapas">
          {[nova ? "Nome da produtora" : "Nome público", "Onde te encontrar", "Pronto"].map((s, i) => <li key={s} className={i < step ? "ok" : i === step ? "on" : undefined}><i>{i < step ? "✓" : i + 1}</i>{s}</li>)}
        </ol>
        {nova && step < 2 && <Link className="ob-cancel" href="/painel">Cancelar</Link>}
      </header>

      <div className="ob-grid">
        <section className="ob-main" key={step}>
          {step === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); if (nameOk && terms) setStep(1); }}>
              {nova ? (
                <>
                  <span className="ob-tag"><i aria-hidden="true" />Nova produtora · {nova.owned + 1} de {nova.max}</span>
                  <h1 className="ob-h">Qual o nome da nova produtora?</h1>
                  <p className="ob-sub">Ela terá página, eventos, equipe e conta de recebimento próprios. No painel, você troca de produtora no topo, ao lado do seu nome.</p>
                </>
              ) : (
                <>
                  <span className="ob-tag"><i aria-hidden="true" />Conta de produtor aprovada</span>
                  <h1 className="ob-h">Boas-vindas{firstName ? `, ${firstName}` : ""}! Como o público vai te chamar?</h1>
                  <p className="ob-sub">É o nome que aparece nos seus eventos, nos ingressos e na sua página. Pode ser a produtora, a festa ou a casa de eventos.</p>
                </>
              )}
              <label className="ob-f">
                <span className="ob-l">Nome do organizador</span>
                <span className={`ob-in ${check.state === "taken" ? "bad" : nameOk ? "good" : ""}`}>
                  <input autoComplete="off" autoFocus value={f.name} maxLength={80} onChange={(e) => { set({ name: e.target.value }); if (e.target.value.trim().length < 2) setCheck({ state: "idle", slug: "" }); }} placeholder="Ex.: Noite Alta Produções" />
                  {check.state === "checking" && <i className="ob-spin" aria-hidden="true" />}
                  {nameOk && <i className="ob-ok" aria-label="Nome disponível"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></i>}
                </span>
                <span className={check.state === "taken" ? "ob-hint bad" : "ob-hint"}>{check.state === "taken" ? "Já existe um produtor com esse nome. Tente uma variação, como o nome da sua cidade junto." : nameOk ? <>Seu endereço: <b>ticketswin.com.br/produtor/{check.slug}</b></> : "Use o nome que o público já conhece."}</span>
              </label>
              {!nova && (
                <label className="ob-terms">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  <span>Li e concordo com os <Link href="/legal/termos" target="_blank">Termos de uso</Link> e a <Link href="/legal/privacidade" target="_blank">Política de privacidade</Link>.</span>
                </label>
              )}
              {error && <p className="ob-err" role="alert">{error}</p>}
              <button className="ob-go" type="submit" disabled={!nameOk || !terms}>Continuar</button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={(e) => { e.preventDefault(); finish(); }}>
              <h1 className="ob-h">Onde o público te encontra?</h1>
              <p className="ob-sub">Esses dados aparecem na sua página de produtor. Dá para mudar depois no painel.</p>
              <div className="ob-2">
                <label className="ob-f"><span className="ob-l">Estado</span><span className="ob-in"><UfSelect value={f.uf} onChange={(uf) => set({ uf })} /></span></label>
                <label className="ob-f"><span className="ob-l">Cidade principal</span><span className="ob-in"><CitySelect uf={f.uf} value={f.city} onChange={(city) => set({ city })} /></span></label>
              </div>
              <label className="ob-f"><span className="ob-l">Instagram</span><span className="ob-in pre"><b>@</b><input autoComplete="off" value={f.instagram.replace(/^@/, "")} onChange={(e) => set({ instagram: e.target.value })} placeholder="suaprodutora" autoCapitalize="off" maxLength={60} /></span></label>
              <label className="ob-f"><span className="ob-l">Uma frase sobre vocês <em>opcional</em></span><span className="ob-in"><input autoComplete="off" value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Ex.: Festas de música eletrônica em galpões desde 2019" maxLength={140} /></span><span className="ob-hint">{f.tagline.length}/140</span></label>
              {error && <p className="ob-err" role="alert">{error}</p>}
              <div className="ob-row">
                <button className="ob-back" type="button" onClick={() => setStep(0)} disabled={busy}>Voltar</button>
                <button className="ob-go" type="submit" disabled={busy}>{busy ? (nova ? "Criando a produtora…" : "Criando sua página…") : nova ? "Criar produtora" : "Criar minha página"}</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div>
              <span className="ob-tag"><i aria-hidden="true" />Tudo pronto</span>
              <h1 className="ob-h">{nova ? `${f.name.trim()} está no ar.` : `Sua página está no ar, ${f.name.trim()}.`}</h1>
              <p className="ob-sub">{nova
                ? "Ela já é a produtora ativa no painel: os eventos que você criar agora saem em nome dela. Antes de vender, cadastre a conta de recebimento dela em Configurações."
                : "Agora crie o primeiro evento: leva poucos minutos e dá para salvar como rascunho. No painel você acompanha vendas, público e repasses."}</p>
              <div className="ob-row">
                <Link className="ob-go" href="/criar-evento">{nova ? `Criar evento em ${f.name.trim()}` : "Criar meu primeiro evento"}</Link>
                <Link className="ob-back" href="/painel">Ir para o painel</Link>
              </div>
              <Link className="ob-link" href={`/produtor/${check.slug}`} target="_blank">{nova ? "Ver a página pública ↗" : "Ver minha página pública ↗"}</Link>
            </div>
          )}
        </section>

        <aside className="ob-prev" aria-label="Prévia da sua página">
          <span className="ob-prev-k">Prévia da sua página</span>
          <div className="ob-page">
            <div className="ob-cover" aria-hidden="true"><span /><span /><span /></div>
            <div className="ob-pbody">
              <span className="ob-avatar" aria-hidden="true">{initialsOf(f.name)}</span>
              <b className="ob-pname">{f.name.trim() || "Nome do organizador"}</b>
              <span className="ob-pmeta">{[f.city.trim() && `${f.city.trim()}${f.uf ? ` – ${f.uf}` : ""}`, f.instagram.trim() && `@${f.instagram.trim().replace(/^@/, "")}`].filter(Boolean).join(" · ") || "Cidade · @instagram"}</span>
              {f.tagline.trim() && <p className="ob-pline">{f.tagline.trim()}</p>}
              <div className="ob-pacts"><span className="ob-pbtn">Seguir</span><span className="ob-pbtn g">Compartilhar</span></div>
              <div className="ob-pev">
                <span className="ob-pev-k">Próximos eventos</span>
                {[0, 1].map((i) => <span key={i} className="ob-pev-i"><i /><span><b /><small /></span></span>)}
              </div>
            </div>
          </div>
          <span className="ob-url">ticketswin.com.br/produtor/<b>{check.slug || "seu-nome"}</b></span>
        </aside>
      </div>
    </main>
  );
}
