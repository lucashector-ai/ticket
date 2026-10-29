"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordLink } from "@/lib/actions/senha";
import { FieldError, FormError, fieldCls, isEmail } from "@/components/auth/fields";
import { ResendButton } from "@/components/auth/resend";

/** "Esqueci a senha": manda um link para criar a nova senha (resposta igual exista ou não a conta). */
export function ForgotForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [errEmail, setErrEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!isEmail(email)) { setErrEmail(true); return false; }
    setErrEmail(false); setBusy(true); setErr(null);
    const r = await requestPasswordLink(email.trim()).catch(() => ({ ok: false, error: "Não foi possível enviar agora. Tente de novo." }));
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não foi possível enviar agora."); return false; }
    setSent(true);
    return true;
  }

  if (sent) {
    return (
      <div className="lx-box">
        <span className="vf-ic" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg>
        </span>
        <h1 className="lx-t">Confira seu e-mail</h1>
        <p className="lx-s">Se houver uma conta com <b>{email.trim().toLowerCase()}</b>, mandamos um link para criar a nova senha. Ele vale por 15 minutos.</p>
        {err && <FormError>{err}</FormError>}
        <div className="vf-alt"><ResendButton label="Reenviar link" onResend={() => send()} /></div>
        <p className="lx-sw">
          Não é esse e-mail? <button type="button" className="au-lk" onClick={() => { setSent(false); setErr(null); }}>Trocar</button>
        </p>
      </div>
    );
  }

  return (
    <form className="lx-box" onSubmit={(e) => void send(e)} noValidate>
      <h1 className="lx-t">Esqueceu a senha?</h1>
      <p className="lx-s">Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.</p>
      {err && <FormError>{err}</FormError>}
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
          autoFocus
          aria-invalid={errEmail || undefined}
        />
      </label>
      {errEmail && <FieldError>Digite um e-mail válido.</FieldError>}
      <button className="lx-btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Enviando…" : "Enviar link"}</button>
      <p className="lx-sw">
        Lembrou a senha? <Link className="au-lk" href="/entrar">Voltar para o login</Link>
      </p>
    </form>
  );
}
