"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { signInInline, signUpInline } from "@/lib/actions/auth";
import { maskPhone } from "@/components/auth/fields";

/** Login/cadastro dentro do checkout, sem sair da página. */
export function InlineAuth({ onDone, returnUrl, highlight }: { onDone: () => void; returnUrl: string; highlight: boolean }) {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = mode === "entrar" ? await signInInline(email, password) : await signUpInline(name, email, password, phone);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Não foi possível entrar."); return; }
    onDone();
  }

  async function google() {
    setBusy(true);
    await authClient.signIn.social({ provider: "google", callbackURL: returnUrl });
  }

  return (
    <div className={highlight ? "cka on" : "cka"} id="conta">
      <div className="cka-h">
        <b className="cka-t">{mode === "entrar" ? "Entre para continuar" : "Crie sua conta"}</b>
        <span className="cka-s">Seus ingressos ficam salvos na sua conta, prontos para mostrar na entrada.</span>
      </div>
      <div className="cka-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "entrar"} className={mode === "entrar" ? "on" : undefined} onClick={() => { setMode("entrar"); setError(null); }}>Já tenho conta</button>
        <button type="button" role="tab" aria-selected={mode === "criar"} className={mode === "criar" ? "on" : undefined} onClick={() => { setMode("criar"); setError(null); }}>Criar conta</button>
      </div>
      <form className="cka-f" onSubmit={submit} noValidate>
        {mode === "criar" && (
          <label className="lf2">
            <span className="lf2-l">Nome completo</span>
            <input className="in2" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Como está no documento" />
          </label>
        )}
        <label className="lf2">
          <span className="lf2-l">E-mail</span>
          <input className="in2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@email.com" />
        </label>
        {mode === "criar" && (
          <label className="lf2">
            <span className="lf2-l">Celular</span>
            <input className="in2" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} autoComplete="tel-national" placeholder="(11) 98765-4321" />
          </label>
        )}
        <label className="lf2">
          <span className="lf2-l">Senha</span>
          <span className="cka-pw">
            <input className="in2" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "entrar" ? "current-password" : "new-password"} placeholder={mode === "entrar" ? "Sua senha" : "Mínimo de 8 caracteres"} />
            <button type="button" className="cka-show" onClick={() => setShow((s) => !s)}>{show ? "Ocultar" : "Mostrar"}</button>
          </span>
        </label>
        {error && <p className="err">{error}</p>}
        <div className="cka-a">
          <button className="go2" type="submit" disabled={busy}>{busy ? "Aguarde…" : mode === "entrar" ? "Entrar e continuar" : "Criar conta e continuar"}</button>
          <button className="sec2 cka-g" type="button" onClick={google} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
            Continuar com Google
          </button>
        </div>
      </form>
    </div>
  );
}
