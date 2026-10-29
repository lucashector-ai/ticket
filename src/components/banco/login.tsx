"use client";

import { useState } from "react";
import { bankLogin, bankVerify } from "@/lib/actions/banco";
import { Turnstile, useHuman } from "@/components/auth/turnstile";
import { CodeBoxes } from "@/components/auth/verify-form";
import { BancoMark } from "./mark";

/** Entrada do banco: e-mail + senha do banco, depois o código do app autenticador. */
export function BancoLogin({ base, human, pending }: { base: string; human: string | null; pending: boolean }) {
  const [step, setStep] = useState<"senha" | "codigo">(pending ? "codigo" : "senha");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const { token, setToken, ready: humanOk } = useHuman(human);
  const [tries, setTries] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pw) { setErr("Digite o e-mail e a senha do banco."); return; }
    setBusy(true); setErr(null);
    const r = await bankLogin(email, pw, token);
    setBusy(false); setTries((n) => n + 1);
    if (!r.ok) { setErr(r.error ?? "Não foi possível entrar."); return; }
    setPw(""); setStep("codigo");
  }
  async function verify(v = code) {
    if (v.length !== 6 || busy) return;
    setBusy(true); setErr(null);
    const r = await bankVerify(v);
    if (r.ok) { window.location.assign(base || "/"); return; }
    setBusy(false); setCode(""); setErr(r.error ?? "Código incorreto.");
  }

  return (
    <main className="bk-login">
      <div className="bk-lcard">
        <BancoMark />
        {step === "senha" ? (
          <form onSubmit={login} noValidate>
            <h1 className="bk-lt">Entre no seu banco</h1>
            <p className="bk-ls">Extrato das vendas, saldo e saques dos seus eventos. Você vai precisar da senha do banco e do app autenticador.</p>
            {err && <p className="bk-err" role="alert">{err}</p>}
            <label className="bk-f"><span>E-mail</span><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} autoComplete="username" placeholder="voce@produtora.com" autoFocus /></label>
            <label className="bk-f"><span>Senha do banco</span><input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} autoComplete="current-password" placeholder="Não é a senha do site" /></label>
            <Turnstile siteKey={human} action="banco" onToken={setToken} resetKey={tries} />
            <button className="bk-go" type="submit" disabled={busy || !humanOk}>{busy ? "Conferindo…" : humanOk ? "Continuar" : "Verificando…"}</button>
            <a className="bk-sec" href={`${base}/criar`}>Criar ou recuperar acesso</a>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void verify(); }} noValidate>
            <h1 className="bk-lt">Código do app</h1>
            <p className="bk-ls">Abra seu app autenticador e digite o código de 6 números da Tickets Win.</p>
            {err && <p className="bk-err" role="alert">{err}</p>}
            <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void verify(v)} disabled={busy} />
            <button className="bk-go" type="submit" disabled={busy || code.length !== 6}>{busy ? "Abrindo…" : "Entrar no banco"}</button>
            <div className="bk-lalt"><button type="button" onClick={() => { setStep("senha"); setErr(null); setCode(""); }}>Voltar</button></div>
          </form>
        )}
      </div>
      <p className="bk-foot">Conexão protegida · A Tickets Win nunca pede sua senha ou código por telefone, e-mail ou WhatsApp.</p>
    </main>
  );
}
