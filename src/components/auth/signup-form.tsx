"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signUpWithEmail } from "@/lib/actions/auth";
import { useToast } from "@/components/toast";
import { GoogleButton } from "@/components/auth/google-button";
import { AppleButton } from "@/components/auth/apple-button";
import { CheckIcon, FieldError, FormError, PasswordField, fieldCls, isEmail } from "@/components/auth/fields";
import { PhoneField } from "@/components/phone-field";
import { phoneValid } from "@/lib/phone";
import { Turnstile, useHuman } from "@/components/auth/turnstile";
import { nextHint } from "@/components/auth/next-hint";

type Err = { name?: boolean; email?: boolean; phone?: boolean; pw?: boolean; terms?: boolean };

const STRENGTH = ["Força da senha", "Fraca", "Razoável", "Boa", "Forte"];

function score(pw: string) {
  if (!pw) return 0;
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (/\d/.test(pw)) sc++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return sc;
}

export function SignupForm({ next, human, apple = false, initialEmail = "" }: { next: string; human: string | null; apple?: boolean; initialEmail?: string }) {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const { flash } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const { setToken: setHumanToken, ready: humanOk } = useHuman(human);
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<Err>({});

  useEffect(() => {
    if (state?.error) flash(state.error);
  }, [state, flash]);

  const sc = score(pw);

  function toggleTerms() {
    setTerms((t) => !t);
    if (err.terms) setErr((o) => ({ ...o, terms: false }));
  }

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const er: Err = {};
    if (name.trim().split(/\s+/).filter(Boolean).length < 2) er.name = true;
    if (!isEmail(email)) er.email = true;
    if (!phoneValid(phone)) er.phone = true;
    if (pw.length < 8) er.pw = true;
    if (!terms) er.terms = true;
    setErr(er);
    if (Object.keys(er).length) {
      e.preventDefault();
      flash("Confira os campos destacados.");
    }
  }

  const loginHref = next && next !== "/" ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar";

  return (
    <form className="lx-box" action={formAction} onSubmit={validate} noValidate>
      <h1 className="lx-t">Crie sua conta</h1>
      <p className="lx-s">{nextHint(next) === "para criar e gerenciar seus eventos" ? "Leva menos de um minuto. Depois você conta sobre seus eventos e já pode criar o primeiro." : "Leva menos de um minuto. Seus ingressos ficam salvos aqui."}</p>
      <input type="hidden" name="next" value={next} />
      {state?.error && <FormError>{state.error}</FormError>}
      <label className="lf">
        <span className="lf-l">Nome completo</span>
        <input
          className={fieldCls(!!err.name)}
          name="name"
          type="text"
          placeholder="Como está no seu documento"
          value={name}
          onChange={(e) => { setName(e.target.value); if (err.name) setErr((o) => ({ ...o, name: false })); }}
          autoComplete="name"
          aria-invalid={err.name || undefined}
        />
      </label>
      {err.name && <FieldError>Digite seu nome e sobrenome.</FieldError>}
      <label className="lf">
        <span className="lf-l">E-mail</span>
        <input
          className={fieldCls(!!err.email)}
          name="email"
          type="email"
          placeholder="Digite seu e-mail"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (err.email) setErr((o) => ({ ...o, email: false })); }}
          autoComplete="email"
          aria-invalid={err.email || undefined}
        />
      </label>
      {err.email && <FieldError>Digite um e-mail válido.</FieldError>}
      <div className="lf">
        <span className="lf-l">Celular</span>
        <PhoneField
          className={fieldCls(!!err.phone)}
          name="phone"
          value={phone}
          onChange={(v) => { setPhone(v); if (err.phone) setErr((o) => ({ ...o, phone: false })); }}
          invalid={!!err.phone}
        />
      </div>
      {err.phone && <FieldError>Confira o celular (com DDD, no Brasil).</FieldError>}
      <PasswordField
        value={pw}
        onChange={(v) => { setPw(v); if (err.pw) setErr((o) => ({ ...o, pw: false })); }}
        placeholder="Mínimo de 8 caracteres"
        autoComplete="new-password"
        error={!!err.pw}
      />
      {err.pw && <FieldError>Use pelo menos 8 caracteres.</FieldError>}
      <div className="str" aria-live="polite">
        <span className="str-b" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => <i key={n} className={sc >= n ? `w${sc}` : undefined} />)}
        </span>
        <span className="str-l">{STRENGTH[sc]}</span>
      </div>
      <div className={`ck${terms ? " on" : ""}${err.terms ? " err" : ""}`}>
        <button
          className="ck-b"
          type="button"
          role="checkbox"
          aria-checked={terms}
          aria-label="Li e aceito os Termos de uso e a Política de privacidade"
          onClick={toggleTerms}
        >
          <CheckIcon />
        </button>
        <span className="ck-t" role="presentation" onClick={toggleTerms}>
          Li e aceito os <Link href="/legal/termos" target="_blank" onClick={(e) => e.stopPropagation()}><u>Termos de uso</u></Link> e a{" "}
          <Link href="/legal/privacidade" target="_blank" onClick={(e) => e.stopPropagation()}><u>Política de privacidade</u></Link>
        </span>
      </div>
      {err.terms && <FieldError>Você precisa aceitar os termos para continuar.</FieldError>}
      <Turnstile siteKey={human} action="signup" resetKey={state} onToken={setHumanToken} />
      <button className="lx-btn" type="submit" disabled={isPending || !humanOk} aria-busy={isPending || !humanOk}>
        {isPending ? "Criando conta…" : humanOk ? "Criar conta" : "Verificando…"}
      </button>
      <GoogleButton label="Cadastrar com Google" next={next} />
      {apple && <AppleButton next={next} />}
      <p className="lx-sw">
        Já tem conta? <Link className="au-lk" href={loginHref}>Entrar</Link>
      </p>
    </form>
  );
}
