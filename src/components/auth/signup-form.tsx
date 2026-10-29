"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signUpWithEmail } from "@/lib/actions/auth";
import { useToast } from "@/components/toast";
import { GoogleButton } from "@/components/auth/google-button";
import { CheckIcon, FieldError, FormError, PasswordField, fieldCls, isEmail, isPhone, maskPhone } from "@/components/auth/fields";
import { Turnstile } from "@/components/auth/turnstile";

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

export function SignupForm({ next, human }: { next: string; human: string | null }) {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const { flash } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    if (!isPhone(phone)) er.phone = true;
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
      <p className="lx-s">Leva menos de um minuto. Seus ingressos ficam salvos aqui.</p>
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
      <label className="lf">
        <span className="lf-l">Celular</span>
        <input
          className={fieldCls(!!err.phone)}
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          value={phone}
          onChange={(e) => { setPhone(maskPhone(e.target.value)); if (err.phone) setErr((o) => ({ ...o, phone: false })); }}
          autoComplete="tel-national"
          aria-invalid={err.phone || undefined}
        />
      </label>
      {err.phone && <FieldError>Digite o celular com DDD.</FieldError>}
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
      <Turnstile siteKey={human} action="signup" resetKey={state} />
      <button className="lx-btn" type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? "Criando conta…" : "Criar conta"}
      </button>
      <GoogleButton label="Cadastrar com Google" next={next} />
      <p className="lx-sw">
        Já tem conta? <Link className="au-lk" href={loginHref}>Entrar</Link>
      </p>
    </form>
  );
}
