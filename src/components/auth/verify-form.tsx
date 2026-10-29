"use client";

import { useEffect, useRef, useState } from "react";
import { ensureLoginCode, resendLoginCode, verifyLoginCode } from "@/lib/actions/verificacao";
import { signOut } from "@/lib/actions/auth";
import { CheckIcon, FormError } from "@/components/auth/fields";

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

export function VerifyForm({ next, whatsapp }: { next: string; whatsapp: boolean }) {
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{ ch?: "email" | "whatsapp"; to?: string } | null>(null);
  const [wait, setWait] = useState(45);

  useEffect(() => {
    let alive = true;
    ensureLoginCode().then((r) => {
      if (!alive) return;
      setInfo({ ch: r.ch, to: r.to });
      if (r.error) setErr(r.error);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(v = code) {
    if (v.length !== 6 || busy) return;
    setBusy(true); setErr(null);
    const r = await verifyLoginCode(v, trust);
    if (r.ok) { window.location.href = next; return; }
    setBusy(false); setErr(r.error ?? "Código incorreto."); setCode("");
  }
  async function resend(want?: "email") {
    setBusy(true); setErr(null);
    const r = await resendLoginCode(want);
    setBusy(false);
    if (r.ch) setInfo({ ch: r.ch, to: r.to });
    if (r.error) setErr(r.error); else setWait(45);
  }

  const where = info?.ch === "whatsapp" ? `pelo WhatsApp para ${info.to}` : info?.to ? `para ${info.to}` : "para você";
  return (
    <form className="lx-box" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <span className="vf-ic" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" /><path d="M8.8 12.2l2.2 2.2 4.4-4.6" /></svg>
      </span>
      <h1 className="lx-t">Confirme que é você</h1>
      <p className="lx-s">Sua conta tem verificação em duas etapas. Digite o código que enviamos {where}.</p>
      {err && <FormError>{err}</FormError>}
      <CodeBoxes value={code} onChange={(v) => { setCode(v); if (err) setErr(null); }} onDone={(v) => void submit(v)} disabled={busy} />
      <button className={trust ? "ck on" : "ck"} type="button" role="checkbox" aria-checked={trust} onClick={() => setTrust((t) => !t)}>
        <span className="ck-b" aria-hidden="true"><CheckIcon /></span>
        <span className="ck-t">Confiar neste aparelho por 30 dias</span>
      </button>
      <button className="lx-btn" type="submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy ? "Confirmando…" : "Confirmar e entrar"}</button>
      <div className="vf-alt">
        <button type="button" className="au-lk" onClick={() => void resend()} disabled={busy || wait > 0}>{wait > 0 ? `Reenviar em ${wait}s` : "Reenviar código"}</button>
        {whatsapp && info?.ch === "whatsapp" && <button type="button" className="au-lk" onClick={() => void resend("email")} disabled={busy || wait > 0}>Receber por e-mail</button>}
      </div>
      <p className="lx-sw">Não é você? <button type="button" className="au-lk" onClick={() => void signOut()}>Entrar com outra conta</button></p>
    </form>
  );
}
