"use client";

import Link from "next/link";
import { useState } from "react";
import { loadAuthClient } from "@/lib/auth/client-lazy";
import { resendActivation } from "@/lib/actions/auth";
import { useToast } from "@/components/toast";
import { FieldError, FormError, fieldCls, isEmail } from "@/components/auth/fields";
import { CodeBoxes } from "@/components/auth/verify-form";
import { RESEND_WAIT, ResendButton } from "@/components/auth/resend";

/**
 * Segunda etapa do cadastro (e o botão do e-mail de ativação): digita o código de 6 números.
 * `known`: e-mail da conta logada (não precisa digitar). `next`: para onde vai depois de ativar.
 */
export function ActivateForm({ initialEmail, known, verified, next, why = null }: { initialEmail: string; known: boolean; verified: boolean; next: string; why?: string | null }) {
  const { flash } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errEmail, setErrEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(verified);

  if (done) {
    return (
      <div className="lx-box">
        <span className="vf-ic" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <h1 className="lx-t">Conta ativa</h1>
        <p className="lx-s">{why ? "Seu e-mail está confirmado. Agora é só seguir com o seu evento." : "Seu e-mail está confirmado. Bora achar o próximo rolê?"}</p>
        <a className="lx-btn" href={next === "/" ? "/explorar" : next}>{next === "/" ? "Explorar eventos" : "Continuar"}</a>
        <p className="lx-sw"><Link className="au-lk" href="/meus-ingressos">Ver meus ingressos</Link></p>
      </div>
    );
  }

  async function submit(v = code) {
    if (busy) return;
    if (!isEmail(email)) { setErrEmail(true); return; }
    if (v.length !== 6) return;
    setBusy(true); setErr(null);
    try {
      const res = await (await loadAuthClient()).emailOtp.verifyEmail({ email: email.trim(), otp: v });
      if (res?.error) {
        // 429: freio de tentativas do site (o servidor manda a mensagem pronta)
        setErr(res.error.status === 429 && res.error.message ? res.error.message : "Código incorreto ou expirado. Confira ou peça outro."); setCode("");
      }
      else {
        flash("Conta ativada!");
        // veio de um convite (ex.: ingresso enviado por alguém): volta direto para ele
        if (next !== "/") { window.location.href = next; return; }
        setDone(true);
      }
    } catch {
      // o cliente do Neon Auth lança erro no 400 (INVALID_OTP)
      setErr("Código incorreto ou expirado. Confira ou peça outro."); setCode("");
    }
    setBusy(false);
  }

  async function otherEmail() {
    try { await (await loadAuthClient()).signOut(); } catch { /* segue para o cadastro mesmo assim */ }
    window.location.href = next === "/" ? "/cadastro" : `/cadastro?next=${encodeURIComponent(next)}`;
  }

  async function resend() {
    if (!isEmail(email)) { setErrEmail(true); return false; }
    setErr(null);
    const r = await resendActivation(email.trim()).catch(() => ({ ok: false, error: "Não foi possível enviar agora." }));
    if (!r.ok) { setErr(r.error ?? "Não foi possível enviar agora."); return false; }
    flash("Mandamos um código novo.");
    return true;
  }

  return (
    <form className="lx-box" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <span className="vf-ic" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg>
      </span>
      <h1 className="lx-t">Ative sua conta</h1>
      {/* `why`: veio de "Criar evento" (a conta pode ser antiga e o código do cadastro já ter vencido) */}
      <p className="lx-s">{why ? `${why} ` : known ? "Falta só confirmar seu e-mail. " : ""}{known
        ? <>Digite o código de 6 números que enviamos para <b>{email}</b>.</>
        : "Digite seu e-mail e o código de 6 números que enviamos."}</p>
      {err && <FormError>{err}</FormError>}
      {!known && (
        <>
          <label className="lf">
            <span className="lf-l">E-mail</span>
            <input className={fieldCls(errEmail)} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrEmail(false); }} autoComplete="email" placeholder="Digite seu e-mail" aria-invalid={errEmail || undefined} />
          </label>
          {errEmail && <FieldError>Digite um e-mail válido.</FieldError>}
        </>
      )}
      <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void submit(v)} disabled={busy} autoFocus={known || !!initialEmail} />
      <button className="lx-btn" type="submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy ? "Confirmando…" : "Ativar conta"}</button>
      {/* nesta visita nada foi enviado: com `why`, pedir o código novo não espera os 30s */}
      <div className="vf-alt"><ResendButton onResend={resend} wait={why ? 0 : RESEND_WAIT} label={why ? "Não tem o código? Enviar um novo" : undefined} /></div>
      <p className="lx-sw">Não chegou? Veja a caixa de spam ou promoções.</p>
      {/* digitou o e-mail errado no cadastro: o código nunca chega; sai da conta pendente e recomeça */}
      {known && !verified && <p className="lx-sw">E-mail errado? <button className="au-lk" type="button" onClick={() => void otherEmail()}>Cadastrar com outro e-mail</button></p>}
    </form>
  );
}
