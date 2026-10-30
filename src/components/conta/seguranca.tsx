"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmEmailMfa, confirmMfaOff, confirmTotp, renewRecovery, resendMfaCode, revokeDevice, revokeOtherDevices, setMarketing, startEmailMfa, startMfaOff,
  startTotp, type DeviceRow,
} from "@/lib/actions/conta";
import { sendMyPasswordLink } from "@/lib/actions/senha";
import { ResendButton } from "@/components/auth/resend";
import { useToast } from "@/components/toast";
import { CodeBoxes } from "@/components/auth/verify-form";

type Props = {
  mfa: { method: "email" | "totp" | null; to: string | null; recoveryLeft: number };
  login: { password: boolean; google: boolean; apple: boolean };
  email: string;
  devices: DeviceRow[];
  activity: { id: string; kind: string; detail: string | null; ip: string | null; device: string; at: string }[];
  marketing: boolean;
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(".", "");
const KIND: Record<string, string> = { login: "Entrada na conta", password: "Senha", mfa_on: "Duas etapas ligada", mfa_off: "Duas etapas desligada", email: "E-mail", session: "Aparelhos", bank: "Banco Tickets Win", payout: "Saque" };

export function ContaSeguranca(p: Props) {
  return (
    <>
      <header className="ct-head">
        <h1 className="ct-t">Privacidade e segurança</h1>
        <p className="ct-s">Proteja sua conta e seus ingressos. Recomendamos ligar a verificação em duas etapas.</p>
      </header>
      <MfaCard {...p} />
      <PasswordCard login={p.login} email={p.email} />
      <DevicesCard devices={p.devices} />
      <ActivityCard activity={p.activity} />
      <PrivacyCard marketing={p.marketing} />
    </>
  );
}

function MfaCard({ mfa, email }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  type Mode = "idle" | "pick" | "totp-cur" | "email-app" | "totp" | "email" | "off" | "renew" | "codes";
  const [mode, setMode] = useState<Mode>("idle");
  const [setup, setSetup] = useState<{ qr: string; key: string; uri: string } | null>(null);
  const [to, setTo] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState(false);

  const reset = () => { setMode("idle"); setCode(""); setErr(null); setSetup(null); setRec(false); };
  const fail = (e?: string) => { setErr(e ?? "Não deu certo. Tente de novo."); setCode(""); };

  async function beginTotp(current?: string) {
    setBusy(true); setErr(null);
    const r = await startTotp(current);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setSetup({ qr: r.qr!, key: r.key!, uri: r.uri! }); setCode(""); setMode("totp");
  }
  async function beginEmail(current?: string) {
    setBusy(true); setErr(null);
    const r = await startEmailMfa(current);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    if (r.needApp) { setCode(""); setRec(false); setMode("email-app"); return; }
    setTo(r.to ?? ""); setCode(""); setRec(false); setMode("email");
  }
  async function beginOff() {
    setBusy(true); setErr(null);
    const r = await startMfaOff();
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setTo(r.totp ? "" : r.to ?? ""); setCode(""); setMode("off");
  }
  async function confirm(v = code) {
    if (busy || (!rec && v.length !== 6)) return;
    setBusy(true); setErr(null);
    if (mode === "totp-cur") { setBusy(false); await beginTotp(v); return; }
    if (mode === "email-app") { setBusy(false); await beginEmail(v); return; }
    const r = mode === "totp" ? await confirmTotp(v) : mode === "email" ? await confirmEmailMfa(v) : mode === "renew" ? await renewRecovery(v) : await confirmMfaOff(v);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    const got = (r as { codes?: string[] }).codes;
    if (got) { setCodes(got); setMode("codes"); setSetup(null); setCode(""); router.refresh(); return; }
    flash(mode === "off" ? "Verificação em duas etapas desligada" : "Verificação em duas etapas ligada");
    reset();
    router.refresh();
  }

  const on = !!mfa.method;
  const codeBox = (label: React.ReactNode, cta: string) => (
    <div className="ct-sub">
      <p className="ct-note">{label}</p>
      {rec
        ? <input autoComplete="off" className="ct-in ct-rec" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 9)); setErr(null); }} placeholder="XXXX-XXXX" autoFocus aria-label="Código de recuperação" />
        : <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void confirm(v)} disabled={busy} />}
      {(mode === "email" || (mode === "off" && mfa.method === "email")) && (
        <ResendButton className="ct-link" key={mode} onResend={async () => { const r = await resendMfaCode(mode === "email" ? "setup" : "off"); if (!r.ok) setErr(r.error ?? null); return r.ok; }} />
      )}
      {mfa.method === "totp" && (mode === "off" || mode === "totp-cur" || mode === "email-app") && <button className="ct-link" type="button" onClick={() => { setRec((x) => !x); setCode(""); setErr(null); }}>{rec ? "Usar o código do app" : "Perdi o celular: usar código de recuperação"}</button>}
      {err && <p className="ct-err" role="alert">{err}</p>}
      <div className="ct-act">
        <button className="ct-b ghost" type="button" onClick={reset}>Cancelar</button>
        <button className="ct-b dark" type="button" onClick={() => void confirm()} disabled={busy || (rec ? code.replace(/[^A-Z0-9]/g, "").length !== 8 : code.length !== 6)}>{busy ? "Confirmando…" : cta}</button>
      </div>
    </div>
  );

  return (
    <section className="ct-card" aria-labelledby="mf-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="mf-t">Verificação em duas etapas {on ? <span className="ct-pill ok">Ligada</span> : <span className="ct-pill warn">Desligada</span>}</h2>
          <p className="ct-v">{mfa.method === "totp"
            ? <>Ao entrar, pedimos o código de 6 números do seu <b>app autenticador</b>. {mfa.recoveryLeft} {mfa.recoveryLeft === 1 ? "código" : "códigos"} de recuperação sobrando.</>
            : mfa.method === "email"
              ? <>Ao entrar com a senha, pedimos um código enviado por e-mail para <b>{mfa.to}</b>. Para mais segurança, use um app autenticador.</>
              : "Além da senha, pedimos um código do seu app autenticador (ou do e-mail). Mesmo que alguém descubra sua senha, não consegue entrar na conta."}</p>
        </div>
        {mode === "idle" && (on
          ? <span className="ct-acts">
              {mfa.method === "email" && <button className="ct-b dark" type="button" onClick={() => void beginTotp()} disabled={busy}>Usar app autenticador</button>}
              {mfa.method === "totp" && <button className="ct-b" type="button" onClick={() => { setMode("totp-cur"); setErr(null); }}>Trocar de celular</button>}
              {mfa.method === "totp" && <button className="ct-b" type="button" onClick={() => void beginEmail()} disabled={busy}>Usar código por e-mail</button>}
              <button className="ct-b ghost" type="button" onClick={() => void beginOff()} disabled={busy}>Desligar</button>
            </span>
          : <button className="ct-b dark" type="button" onClick={() => setMode("pick")}>Ligar agora</button>)}
      </div>
      {mode === "idle" && mfa.method === "totp" && <button className="ct-link" type="button" onClick={() => { setMode("renew"); setErr(null); }}>Gerar novos códigos de recuperação</button>}
      {mode === "idle" && err && <p className="ct-err" role="alert">{err}</p>}

      {mode === "pick" && (
        <div className="ct-sub">
          <div className="ct-opts">
            <button type="button" className="ct-opt on" onClick={() => void beginTotp()} disabled={busy}>
              <span className="ct-opt-i" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M12 8v4l2.5 1.5" /></svg></span>
              <b>App autenticador <em>recomendado</em></b><small>Google Authenticator, 1Password, iCloud Senhas…</small>
            </button>
            <button type="button" className="ct-opt" onClick={() => void beginEmail()} disabled={busy}>
              <span className="ct-opt-i" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg></span>
              <b>Código por e-mail</b><small>{email}</small>
            </button>
          </div>
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act"><button className="ct-b ghost" type="button" onClick={reset}>Cancelar</button></div>
        </div>
      )}

      {mode === "totp-cur" && codeBox(<>Para cadastrar outro celular, digite primeiro o código do app que você usa hoje.</>, "Continuar")}
      {mode === "email-app" && codeBox(<>Para trocar o app pelo código por e-mail, digite primeiro o código do app autenticador. Depois mandamos um código para o seu e-mail.</>, "Continuar")}

      {mode === "totp" && setup && (
        <div className="ct-sub">
          <div className="ct-totp">
            <span className="ct-qr" aria-label="QR code para o app autenticador" role="img" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <ol className="ct-steps">
              <li>Abra seu app autenticador ou o gerenciador de senhas (Google Authenticator, Microsoft Authenticator, 1Password, iCloud Senhas…).</li>
              <li>Escaneie o QR code. No celular, toque em <a href={setup.uri}>abrir no app</a>, ou digite a chave:<code className="ct-key">{setup.key}</code></li>
              <li>Digite abaixo o código de 6 números que aparece para a Tickets Win.</li>
            </ol>
          </div>
          <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void confirm(v)} disabled={busy} autoFocus={false} />
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={reset}>Cancelar</button>
            <button className="ct-b dark" type="button" onClick={() => void confirm()} disabled={busy || code.length !== 6}>{busy ? "Confirmando…" : "Ativar"}</button>
          </div>
        </div>
      )}

      {mode === "email" && codeBox(<>Enviamos um código para <b>{to}</b>. Digite aqui para {mfa.method === "totp" ? "passar a usar o e-mail" : "ativar"}.</>, "Ativar")}
      {mode === "renew" && codeBox(<>Digite o código do app autenticador para gerar novos códigos. Os antigos deixam de valer.</>, "Gerar códigos")}
      {mode === "off" && codeBox(mfa.method === "totp"
        ? <>Para desligar, digite o código do app autenticador. Sem ele, o Banco Tickets Win fica bloqueado.</>
        : <>Para desligar, digite o código que enviamos para <b>{to}</b>.</>, "Desligar")}

      {mode === "codes" && (
        <div className="ct-sub">
          <p className="ct-note"><b>Guarde estes códigos de recuperação</b> no seu gerenciador de senhas ou em um lugar seguro. Cada um vale uma vez e serve para entrar se você perder o celular. Eles não aparecem de novo.</p>
          <ul className="ct-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); flash("Códigos copiados"); }}>Copiar</button>
            <a className="ct-b ghost" download="tickets-win-codigos-de-recuperacao.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Tickets Win: códigos de recuperação (${email})\n\n${codes.join("\n")}\n`)}`}>Baixar .txt</a>
            <button className="ct-b dark" type="button" onClick={() => { setCodes([]); reset(); flash("Verificação em duas etapas ligada"); }}>Já guardei</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PasswordCard({ login, email }: { login: Props["login"]; email: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    const r = await sendMyPasswordLink().catch(() => ({ ok: false, error: "Não foi possível enviar agora.", to: undefined }));
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não foi possível enviar agora."); return false; }
    setSent(r.to ?? email);
    return true;
  }

  // conta criada pelo Google ou pela Apple: a senha é a da conta deles
  if (!login.password) {
    const by = login.google ? "Google" : login.apple ? "Apple" : null;
    return (
      <section className="ct-card" aria-labelledby="pw-t">
        <div className="ct-row">
          <div>
            <h2 className="ct-h" id="pw-t">{by ? <>Acesso pelo {by} <span className="ct-pill">{by}</span></> : "Senha"}</h2>
            <p className="ct-v">{login.google
              ? "Sua conta entra com o Google, então não tem senha na Tickets Win para trocar. A senha e a segurança do acesso ficam na sua conta Google."
              : login.apple
                ? "Sua conta entra com a Apple, então não tem senha na Tickets Win para trocar. A senha e a segurança do acesso ficam no seu Apple ID."
                : "Sua conta não tem senha na Tickets Win."}</p>
          </div>
          {login.google && <a className="ct-b" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Segurança do Google</a>}
          {!login.google && login.apple && <a className="ct-b" href="https://account.apple.com" target="_blank" rel="noopener noreferrer">Conta Apple</a>}
        </div>
      </section>
    );
  }

  return (
    <section className="ct-card" aria-labelledby="pw-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="pw-t">Senha</h2>
          <p className="ct-v">{login.google ? "Você entra com o Google ou com a sua senha. " : login.apple ? "Você entra com a Apple ou com a sua senha. " : ""}Para trocar, mandamos um link para o seu e-mail. Só quem abre o e-mail consegue criar a senha nova.</p>
        </div>
        {!sent && <button className="ct-b" type="button" onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Trocar senha"}</button>}
      </div>
      {!sent && <p className="ct-note">O link vai para <b>{maskMail(email)}</b>. Esse não é seu e-mail? <Link href="/conta">Trocar o e-mail</Link>.</p>}
      {sent && (
        <div className="ct-sub">
          <p className="ct-note">Enviamos um link para <b>{sent}</b>. Abra o e-mail e toque em <b>Criar nova senha</b>. O link vale por 15 minutos.</p>
          <ResendButton className="ct-link" label="Reenviar link" onResend={send} />
        </div>
      )}
      {err && <p className="ct-err" role="alert">{err}</p>}
    </section>
  );
}

/** mesma máscara do servidor: l••••••s@gmail.com */
const maskMail = (e: string) => e.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => a + "•".repeat(Math.min(10, Math.max(2, mid.length))) + b);

function DevicesCard({ devices }: { devices: DeviceRow[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const others = devices.filter((d) => !d.current).length;
  async function out(token: string | null) {
    setBusy(token ?? "all");
    const r = token ? await revokeDevice(token) : await revokeOtherDevices();
    setBusy(null);
    if (!r.ok) { flash(r.error ?? "Não foi possível desconectar."); return; }
    flash(token ? "Aparelho desconectado" : "Outros aparelhos desconectados");
    router.refresh();
  }
  return (
    <section className="ct-card" aria-labelledby="dv-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="dv-t">Aparelhos conectados</h2>
          <p className="ct-v">Onde sua conta está aberta agora. Não reconhece algum? Desconecte e troque a senha.</p>
        </div>
        {others > 0 && <button className="ct-b ghost" type="button" disabled={!!busy} onClick={() => void out(null)}>{busy === "all" ? "Desconectando…" : "Desconectar os outros"}</button>}
      </div>
      <ul className="ct-list">
        {devices.map((d) => (
          <li key={d.token}>
            <span className="ct-li-i" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{/iPhone|Android/.test(d.device) ? <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></> : <><rect x="3" y="5" width="18" height="11" rx="2" /><path d="M8 20h8M12 16v4" /></>}</svg></span>
            <span className="ct-li-t"><b>{d.device}{d.current && <span className="ct-pill ok">Este aparelho</span>}</b><small>{[d.ip, `ativo em ${when(d.updatedAt)}`].filter(Boolean).join(" · ")}</small></span>
            {!d.current && <button className="ct-b sm ghost" type="button" disabled={!!busy} onClick={() => void out(d.token)}>{busy === d.token ? "…" : "Desconectar"}</button>}
          </li>
        ))}
        {!devices.length && <li className="ct-empty">Não conseguimos listar os aparelhos agora.</li>}
      </ul>
    </section>
  );
}

function ActivityCard({ activity }: { activity: Props["activity"] }) {
  return (
    <section className="ct-card" aria-labelledby="at-t">
      <h2 className="ct-h" id="at-t">Atividade recente</h2>
      <ul className="ct-list">
        {activity.map((a) => (
          <li key={a.id}>
            <span className="ct-li-i" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg></span>
            <span className="ct-li-t"><b>{KIND[a.kind] ?? "Conta"}{a.detail ? ` · ${a.detail}` : ""}</b><small>{[when(a.at), a.device, a.ip].filter(Boolean).join(" · ")}</small></span>
          </li>
        ))}
        {!activity.length && <li className="ct-empty">Nada por aqui ainda. As próximas entradas e mudanças de segurança aparecem nesta lista.</li>}
      </ul>
    </section>
  );
}

function PrivacyCard({ marketing }: { marketing: boolean }) {
  const { flash } = useToast();
  const [on, setOn] = useState(marketing);
  return (
    <section className="ct-card" aria-labelledby="pv-t">
      <h2 className="ct-h" id="pv-t">Privacidade</h2>
      <label className="ct-tg">
        <span><b>Novidades e eventos por e-mail</b><small>Lançamentos, pré-vendas e eventos parecidos com os que você curte.</small></span>
        <input className="sr" type="checkbox" checked={on} onChange={async (e) => { const v = e.target.checked; setOn(v); const r = await setMarketing(v); if (!r.ok) setOn(!v); else flash(v ? "Você vai receber as novidades" : "Pronto, sem e-mails de novidades"); }} />
        <span className="ct-sw" aria-hidden="true" />
      </label>
      <p className="ct-note">Avisos importantes do seu pedido e dos seus ingressos chegam sempre. Saiba como cuidamos dos seus dados na <Link href="/legal/privacidade">Política de privacidade</Link>. Para baixar seus dados ou excluir a conta, <Link href="/ajuda">fale com a gente</Link>.</p>
    </section>
  );
}
