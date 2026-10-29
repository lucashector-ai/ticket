"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signInWithEmail } from "@/lib/actions/auth";
import { useToast } from "@/components/toast";
import { GoogleButton } from "@/components/auth/google-button";
import { CheckIcon, FieldError, FormError, PasswordField, fieldCls, isEmail } from "@/components/auth/fields";
import { Turnstile } from "@/components/auth/turnstile";

type Err = { email?: boolean; pw?: boolean };

export function LoginForm({ next, human }: { next: string; human: string | null }) {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const { flash } = useToast();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [rem, setRem] = useState(true);
  const [err, setErr] = useState<Err>({});

  useEffect(() => {
    if (state?.error) flash(state.error);
  }, [state, flash]);

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const er: Err = {};
    if (!isEmail(email)) er.email = true;
    if (!pw) er.pw = true;
    setErr(er);
    if (er.email || er.pw) {
      e.preventDefault();
      flash("Confira os campos destacados.");
    }
  }

  const signupHref = next && next !== "/" ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro";

  return (
    <form className="lx-box" action={formAction} onSubmit={validate} noValidate>
      <h1 className="lx-t">Bem-vindo de volta</h1>
      <p className="lx-s">Digite seu e-mail e senha para acessar sua conta.</p>
      <input type="hidden" name="next" value={next} />
      {state?.error && <FormError>{state.error}</FormError>}
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
      <PasswordField
        value={pw}
        onChange={(v) => { setPw(v); if (err.pw) setErr((o) => ({ ...o, pw: false })); }}
        placeholder="Digite sua senha"
        autoComplete="current-password"
        error={!!err.pw}
      />
      {err.pw && <FieldError>Digite sua senha.</FieldError>}
      <div className="lx-row">
        <button className={rem ? "ck on" : "ck"} type="button" role="checkbox" aria-checked={rem} onClick={() => setRem((r) => !r)}>
          <span className="ck-b" aria-hidden="true"><CheckIcon /></span>
          <span className="ck-t">Lembrar de mim</span>
        </button>
        <Link className="au-lk" href="/esqueci-senha">Esqueci a senha</Link>
      </div>
      <Turnstile siteKey={human} action="login" resetKey={state} />
      <button className="lx-btn" type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? "Entrando…" : "Entrar"}
      </button>
      <GoogleButton label="Entrar com Google" next={next} />
      <p className="lx-sw">
        Ainda não tem conta? <Link className="au-lk" href={signupHref}>Criar conta</Link>
      </p>
    </form>
  );
}
