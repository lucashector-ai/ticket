"use client";

import { useState } from "react";
import { bankSetupEmail, bankSetupPassword, bankSetupStart, bankSetupTotp } from "@/lib/actions/banco";
import { Turnstile, useHuman } from "@/components/auth/turnstile";
import { CodeBoxes } from "@/components/auth/verify-form";
import { BancoMark } from "./mark";

const STEPS = ["E-mail", "Código do e-mail", "App autenticador", "Senha do banco"];

/** Criar ou recuperar o acesso ao banco: código no e-mail → código do app → senha nova. */
export function BancoSetup({ base, human, contaUrl }: { base: string; human: string | null; contaUrl: string }) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [to, setTo] = useState("");
  const { token, setToken, ready: humanOk } = useHuman(human);
  const [tries, setTries] = useState(0);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [noApp, setNoApp] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<boolean>) => { setBusy(true); setErr(null); const ok = await fn().catch(() => false); setBusy(false); return ok; };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const r = await bankSetupStart(email, token);
      setTries((n) => n + 1);
      if (!r.ok) { setErr(r.error ?? "Não foi possível continuar."); return false; }
      setTo(r.to ?? ""); setCode(""); setStep(1); return true;
    });
  }
  async function checkEmail(v = code) {
    if (v.length !== 6 || busy) return;
    await run(async () => {
      const r = await bankSetupEmail(email, v);
      if (!r.ok) { setErr(r.error ?? "Código incorreto."); setCode(""); return false; }
      setCode(""); setNoApp(!r.totp); setStep(2); return true;
    });
  }
  async function checkApp(v = code) {
    if (v.length !== 6 || busy) return;
    await run(async () => {
      const r = await bankSetupTotp(v);
      if (!r.ok) { setErr(r.error ?? "Código incorreto."); setCode(""); return false; }
      setCode(""); setStep(3); return true;
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setErr("As senhas não batem."); return; }
    await run(async () => {
      const r = await bankSetupPassword(pw);
      if (!r.ok) { setErr(r.error ?? "Não foi possível salvar."); return false; }
      setDone(true); return true;
    });
  }

  const strong = [pw.length >= 10, /[a-zA-Z]/.test(pw) && /\d/.test(pw), !!pw && pw === pw2];
  return (
    <main className="bk-login">
      <div className="bk-lcard">
        <BancoMark />
        {done ? (
          <div className="bk-done">
            <span className="bk-done-i" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <h1 className="bk-lt">Acesso criado</h1>
            <p className="bk-ls">Agora entre com seu e-mail, a senha do banco e o código do app autenticador.</p>
            <a className="bk-go" href={`${base}/entrar`}>Entrar no banco</a>
          </div>
        ) : (
          <>
            <ol className="bk-steps" aria-label="Etapas">
              {STEPS.map((s, i) => <li key={s} className={i < step ? "ok" : i === step ? "on" : undefined}><span>{i < step ? "✓" : i + 1}</span>{s}</li>)}
            </ol>

            {step === 0 && (
              <form onSubmit={start} noValidate>
                <h1 className="bk-lt">Criar ou recuperar acesso</h1>
                <p className="bk-ls">Para proteger o dinheiro dos seus eventos, confirmamos o e-mail da conta e o app autenticador antes de criar a senha do banco.</p>
                {err && <p className="bk-err" role="alert">{err}</p>}
                <label className="bk-f"><span>E-mail da conta de produtor</span><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} autoComplete="username" placeholder="voce@produtora.com" autoFocus /></label>
                <Turnstile siteKey={human} action="banco_criar" onToken={setToken} resetKey={tries} />
                <button className="bk-go" type="submit" disabled={busy || !email.trim() || !humanOk}>{busy ? "Enviando…" : humanOk ? "Enviar código" : "Verificando…"}</button>
              </form>
            )}

            {step === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); void checkEmail(); }} noValidate>
                <h1 className="bk-lt">Confira seu e-mail</h1>
                <p className="bk-ls">Se <b>{to}</b> for de um produtor, mandamos um código de 6 números. Ele vale por 10 minutos.</p>
                {err && <p className="bk-err" role="alert">{err}</p>}
                <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void checkEmail(v)} disabled={busy} />
                <button className="bk-go" type="submit" disabled={busy || code.length !== 6}>{busy ? "Conferindo…" : "Continuar"}</button>
                <div className="bk-lalt"><button type="button" onClick={() => { setStep(0); setErr(null); setCode(""); }}>Trocar e-mail</button></div>
              </form>
            )}

            {step === 2 && (noApp ? (
              <div className="bk-need">
                <h1 className="bk-lt">Falta o app autenticador</h1>
                <p className="bk-ls">O banco só abre com um app autenticador (Google Authenticator, 1Password, iCloud Senhas…). Cadastre o seu em <b>Minha conta → Privacidade e segurança</b> e volte aqui.</p>
                <a className="bk-go" href={contaUrl} target="_blank" rel="noopener">Cadastrar app autenticador</a>
                <div className="bk-lalt"><button type="button" onClick={() => { setStep(0); setErr(null); }}>Já cadastrei, começar de novo</button></div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void checkApp(); }} noValidate>
                <h1 className="bk-lt">Código do app</h1>
                <p className="bk-ls">Abra seu app autenticador e digite o código de 6 números da Tickets Win.</p>
                {err && <p className="bk-err" role="alert">{err}</p>}
                <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void checkApp(v)} disabled={busy} />
                <button className="bk-go" type="submit" disabled={busy || code.length !== 6}>{busy ? "Conferindo…" : "Continuar"}</button>
              </form>
            ))}

            {step === 3 && (
              <form onSubmit={save} noValidate>
                <h1 className="bk-lt">Crie a senha do banco</h1>
                <p className="bk-ls">Use uma senha só para o banco, diferente da senha do site. Guarde no seu gerenciador de senhas.</p>
                {err && <p className="bk-err" role="alert">{err}</p>}
                <label className="bk-f"><span>Senha do banco</span><input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} autoComplete="new-password" autoFocus /></label>
                <label className="bk-f"><span>Repita a senha</span><input type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr(null); }} autoComplete="new-password" /></label>
                <ul className="bk-rules">
                  <li className={strong[0] ? "ok" : undefined}>Pelo menos 10 caracteres</li>
                  <li className={strong[1] ? "ok" : undefined}>Letras e números</li>
                  <li className={strong[2] ? "ok" : undefined}>As duas iguais</li>
                </ul>
                <button className="bk-go" type="submit" disabled={busy || !strong.every(Boolean)}>{busy ? "Salvando…" : "Criar senha do banco"}</button>
              </form>
            )}
          </>
        )}
      </div>
      <p className="bk-foot"><a href={`${base}/entrar`}>Voltar para entrar</a> · A Tickets Win nunca pede sua senha ou código por telefone, e-mail ou WhatsApp.</p>
    </main>
  );
}
