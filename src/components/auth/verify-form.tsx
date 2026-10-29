"use client";

import { useEffect, useRef, useState } from "react";
import { ensureLoginCode, resendLoginCode, verifyLoginCode } from "@/lib/actions/verificacao";
import { signOut } from "@/lib/actions/auth";
import { FormError } from "@/components/auth/fields";
import { ResendButton } from "@/components/auth/resend";
import { SUPPORT } from "@/lib/site";

/** Seis caixinhas de código, com colar e apagar naturais. Também usada em Minha conta. */
export function CodeBoxes({ value, onChange, onDone, disabled, autoFocus = true }: { value: string; onChange: (v: string) => void; onDone?: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (v: string, focus: number) => {
    const clean = v.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    refs.current[Math.min(focus, 5)]?.focus();
    if (clean.length === 6) onDone?.(clean);
  };
  return (
    <div className="otp6" role="group" aria-label="Código de 6 dígitos">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={value[i] ? "on" : undefined}
          type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6}
          aria-label={`Dígito ${i + 1}`} disabled={disabled} autoFocus={autoFocus && i === 0}
          value={value[i] ?? ""}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return;
            // colar ou o preenchimento do celular trazem o código inteiro de uma vez
            if (typed.length > 1) { set(typed, typed.length); return; }
            set(value.slice(0, i) + typed + value.slice(i + 1), i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (value[i]) set(value.slice(0, i) + value.slice(i + 1), i);
              else if (i > 0) set(value.slice(0, i - 1) + value.slice(i), i - 1);
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export function VerifyForm({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [rec, setRec] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{ ch?: "email" | "totp"; to?: string; wait?: number } | null>(null);

  useEffect(() => {
    let alive = true;
    ensureLoginCode().then((r) => {
      if (!alive) return;
      setInfo({ ch: r.ch, to: r.to, wait: r.wait ?? 0 });
      if (r.error) setErr(r.error);
    });
    return () => { alive = false; };
  }, []);

  async function submit(v = rec ?? code) {
    if (busy || (rec === null ? v.length !== 6 : v.replace(/[^a-z0-9]/gi, "").length !== 8)) return;
    setBusy(true); setErr(null);
    const r = await verifyLoginCode(v);
    if (r.ok) { window.location.href = next; return; }
    setBusy(false); setErr(r.error ?? "Código incorreto."); setCode("");
  }
  async function resend() {
    setErr(null);
    const r = await resendLoginCode();
    if (r.ch) setInfo((o) => ({ ...o, ch: r.ch, to: r.to }));
    if (r.error) setErr(r.error);
    return r.ok;
  }

  const totp = info?.ch === "totp";
  const text = rec !== null
    ? "Digite um dos códigos de recuperação que você guardou ao ligar a verificação. Cada código vale uma vez só."
    : totp
      ? "Abra seu app autenticador (Google Authenticator, 1Password, iCloud Senhas…) e digite o código de 6 números da Tickets Win."
      : `Sua conta tem verificação em duas etapas. Digite o código que enviamos ${info?.to ? `para ${info.to}` : "para o seu e-mail"}.`;
  return (
    <form className="lx-box" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <span className="vf-ic" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" /><path d="M8.8 12.2l2.2 2.2 4.4-4.6" /></svg>
      </span>
      <h1 className="lx-t">{rec !== null ? "Código de recuperação" : "Confirme que é você"}</h1>
      <p className="lx-s">{info ? text : "Carregando…"}</p>
      {err && <FormError>{err}</FormError>}
      {rec !== null
        ? <input className="in vf-rec" value={rec} onChange={(e) => { setRec(e.target.value.toUpperCase().slice(0, 9)); setErr(null); }} placeholder="XXXX-XXXX" autoComplete="off" autoFocus aria-label="Código de recuperação" />
        : <CodeBoxes value={code} onChange={(v) => { setCode(v); if (err) setErr(null); }} onDone={(v) => void submit(v)} disabled={busy} />}
      <button className="lx-btn" type="submit" disabled={busy || (rec === null ? code.length !== 6 : rec.replace(/[^A-Z0-9]/g, "").length !== 8)} aria-busy={busy}>{busy ? "Confirmando…" : "Confirmar e entrar"}</button>
      <div className="vf-alt">
        {totp
          ? <button type="button" className="au-lk" onClick={() => { setRec(rec === null ? "" : null); setErr(null); }}>{rec === null ? "Perdi o celular: usar código de recuperação" : "Usar o app autenticador"}</button>
          : info?.ch === "email" && <ResendButton onResend={resend} wait={info.wait} disabled={busy} />}
      </div>
      {(rec !== null || info?.ch === "email") && (
        <div className="vf-help">
          <b>{rec !== null ? "Perdeu o celular e os códigos?" : "Não consegue receber o código?"}</b>
          <span>Fale com o suporte da Tickets Win: a gente confirma que a conta é sua e ajuda você a entrar.</span>
          <span className="vf-help-a">
            <a className="vf-wa" href={`${SUPPORT.whatsappUrl}?text=${encodeURIComponent("Oi! Não consigo entrar na minha conta da Tickets Win: perdi o acesso à verificação em duas etapas.")}`} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
            <a className="au-lk" href="/contato?assunto=conta">Mandar mensagem</a>
          </span>
        </div>
      )}
      <p className="lx-sw">Não é você? <button type="button" className="au-lk" onClick={() => void signOut()}>Entrar com outra conta</button></p>
    </form>
  );
}
