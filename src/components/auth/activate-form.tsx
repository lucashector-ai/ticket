"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useToast } from "@/components/toast";
import { FieldError, FormError, fieldCls, isEmail } from "@/components/auth/fields";

/** Digita o código do e-mail de ativação; dá para pedir outro código. */
export function ActivateForm({ initialEmail, verified }: { initialEmail: string; verified: boolean }) {
  const { flash } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ email?: boolean; otp?: boolean }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [done, setDone] = useState(verified);

  if (done) {
    return (
      <div className="lx-box">
        <h1 className="lx-t">Conta ativa</h1>
        <p className="lx-s">Seu e-mail está confirmado. Bora achar o próximo rolê?</p>
        <Link className="lx-btn" href="/explorar">Explorar eventos</Link>
        <p className="lx-sw"><Link className="au-lk" href="/meus-ingressos">Ver meus ingressos</Link></p>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er = { email: !isEmail(email), otp: otp.trim().length < 4 };
    setErr(er);
    if (er.email || er.otp) return;
    setBusy(true);
    setServerErr(null);
    try {
      const res = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: otp.trim() });
      if (res?.error) setServerErr("Código inválido ou expirado. Peça um novo código.");
      else { setDone(true); flash("Conta ativada!"); router.refresh(); }
    } catch {
      // o cliente do Neon Auth lança erro no 400 (INVALID_OTP)
      setServerErr("Código inválido ou expirado. Confira ou peça um novo código.");
    }
    setBusy(false);
  }

  async function resend() {
    if (!isEmail(email)) { setErr({ email: true }); return; }
    setBusy(true);
    try { await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "email-verification" }); } catch { /* resposta genérica */ }
    setBusy(false);
    flash("Se houver uma conta com este e-mail, mandamos um código novo.");
  }

  return (
    <form className="lx-box" onSubmit={submit} noValidate>
      <h1 className="lx-t">Ative sua conta</h1>
      <p className="lx-s">Digite o código de 6 dígitos que enviamos para o seu e-mail.</p>
      {serverErr && <FormError>{serverErr}</FormError>}
      <label className="lf">
        <span className="lf-l">E-mail</span>
        <input className={fieldCls(!!err.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="Digite seu e-mail" aria-invalid={err.email || undefined} />
      </label>
      {err.email && <FieldError>Digite um e-mail válido.</FieldError>}
      <label className="lf">
        <span className="lf-l">Código</span>
        <input className={fieldCls(!!err.otp)} type="text" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" placeholder="000000" autoFocus={!!initialEmail} aria-invalid={err.otp || undefined} />
      </label>
      {err.otp && <FieldError>Digite o código que você recebeu.</FieldError>}
      <button className="lx-btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Confirmando…" : "Ativar conta"}</button>
      <button className="lx-soc" type="button" onClick={() => void resend()} disabled={busy}>Enviar outro código</button>
    </form>
  );
}
