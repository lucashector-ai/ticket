"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { resetPasswordWithCode } from "@/lib/actions/auth";
import { useToast } from "@/components/toast";
import { FieldError, FormError, PasswordField, fieldCls, isEmail } from "@/components/auth/fields";

const GENERIC = "Se o e-mail estiver cadastrado, você receberá um código.";

/** `initialEmail`/`withCode`: vindo do botão do e-mail, já abre no passo do código. */
export function ForgotForm({ initialEmail = "", withCode = false }: { initialEmail?: string; withCode?: boolean }) {
  const { flash } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [errEmail, setErrEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(withCode && isEmail(initialEmail));
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<{ otp?: boolean; pw?: boolean }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isEmail(email)) { setErrEmail(true); return; }
    setErrEmail(false);
    setBusy(true);
    setServerErr(null);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "forget-password" });
    } catch {
      // Mensagem genérica de propósito: não revelamos se o e-mail existe.
    }
    setBusy(false);
    setSent(true);
    flash(GENERIC);
  }

  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er: typeof err = {};
    if (otp.trim().length < 4) er.otp = true;
    if (pw.length < 8) er.pw = true;
    setErr(er);
    if (er.otp || er.pw) return;
    setBusy(true);
    setServerErr(null);
    try {
      const res = await resetPasswordWithCode(email.trim(), otp.trim(), pw);
      if (!res.ok) {
        setServerErr("Código inválido ou expirado. Peça um novo código.");
      } else {
        flash("Senha redefinida. Faça login com a nova senha.");
        router.push("/entrar");
        return;
      }
    } catch {
      setServerErr("Não foi possível redefinir a senha agora. Tente de novo em instantes.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <form className="lx-box" onSubmit={reset} noValidate>
        <h1 className="lx-t">Confira seu e-mail</h1>
        <p className="lx-s">{GENERIC} Digite o código e escolha uma nova senha.</p>
        <p className="au-note">Código enviado para <b>{email.trim()}</b>, se houver uma conta com este e-mail.</p>
        {serverErr && <FormError>{serverErr}</FormError>}
        <label className="lf">
          <span className="lf-l">Código</span>
          <input
            className={fieldCls(!!err.otp)}
            type="text"
            inputMode="numeric"
            placeholder="Digite o código recebido"
            value={otp}
            onChange={(e) => { setOtp(e.target.value); if (err.otp) setErr((o) => ({ ...o, otp: false })); }}
            autoComplete="one-time-code"
            aria-invalid={err.otp || undefined}
          />
        </label>
        {err.otp && <FieldError>Digite o código que você recebeu.</FieldError>}
        <PasswordField
          name="new-password"
          label="Nova senha"
          value={pw}
          onChange={(v) => { setPw(v); if (err.pw) setErr((o) => ({ ...o, pw: false })); }}
          placeholder="Mínimo de 8 caracteres"
          autoComplete="new-password"
          error={!!err.pw}
        />
        {err.pw && <FieldError>Use pelo menos 8 caracteres.</FieldError>}
        <button className="lx-btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Redefinindo…" : "Redefinir senha"}</button>
        <button className="lx-soc" type="button" onClick={() => { setSent(false); setOtp(""); setPw(""); setErr({}); setServerErr(null); }}>Enviar outro código</button>
        <p className="lx-sw">
          Lembrou a senha? <Link className="au-lk" href="/entrar">Voltar para o login</Link>
        </p>
      </form>
    );
  }

  return (
    <form className="lx-box" onSubmit={send} noValidate>
      <h1 className="lx-t">Esqueceu a senha?</h1>
      <p className="lx-s">Digite seu e-mail e enviamos um código para criar uma nova senha.</p>
      <label className="lf">
        <span className="lf-l">E-mail</span>
        <input
          className={fieldCls(errEmail)}
          name="email"
          type="email"
          placeholder="Digite seu e-mail"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (errEmail) setErrEmail(false); }}
          autoComplete="email"
          aria-invalid={errEmail || undefined}
        />
      </label>
      {errEmail && <FieldError>Digite um e-mail válido.</FieldError>}
      <button className="lx-btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Enviando…" : "Enviar código"}</button>
      <p className="lx-sw">
        Lembrou a senha? <Link className="au-lk" href="/entrar">Voltar para o login</Link>
      </p>
    </form>
  );
}
