"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  changePassword, confirmMfa, confirmMfaOff, revokeDevice, revokeOtherDevices, setMarketing, startMfa, startMfaOff, type DeviceRow,
} from "@/lib/actions/conta";
import { useToast } from "@/components/toast";
import { maskPhone } from "@/components/auth/fields";
import { CodeBoxes } from "@/components/auth/verify-form";

type Props = {
  mfa: { method: "email" | "whatsapp" | null; to: string | null };
  whatsapp: boolean;
  phone: string;
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
      <PasswordCard />
      <DevicesCard devices={p.devices} />
      <ActivityCard activity={p.activity} />
      <PrivacyCard marketing={p.marketing} />
    </>
  );
}

function MfaCard({ mfa, whatsapp, phone, email }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const [mode, setMode] = useState<"idle" | "pick" | "code" | "off">("idle");
  const [method, setMethod] = useState<"email" | "whatsapp">(mfa.method ?? "email");
  const [tel, setTel] = useState(maskPhone(phone));
  const [to, setTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setMode("idle"); setCode(""); setErr(null); };
  async function send() {
    setBusy(true); setErr(null);
    const r = mode === "off" ? await startMfaOff() : await startMfa(method, tel);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não foi possível enviar o código."); return; }
    setTo(r.to ?? ""); setCode("");
    if (mode !== "off") setMode("code");
  }
  async function confirm(v = code) {
    if (v.length !== 6) return;
    setBusy(true); setErr(null);
    const r = mode === "off" ? await confirmMfaOff(v) : await confirmMfa(v);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Código incorreto."); setCode(""); return; }
    flash(mode === "off" ? "Verificação em duas etapas desligada" : "Verificação em duas etapas ligada");
    reset();
    router.refresh();
  }

  const on = !!mfa.method;
  return (
    <section className="ct-card" aria-labelledby="mf-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="mf-t">Verificação em duas etapas {on ? <span className="ct-pill ok">Ligada</span> : <span className="ct-pill warn">Desligada</span>}</h2>
          <p className="ct-v">{on
            ? <>Ao entrar com a senha, pedimos um código enviado {mfa.method === "whatsapp" ? "pelo WhatsApp" : "por e-mail"} para <b>{mfa.to}</b>.</>
            : "Além da senha, pedimos um código enviado por e-mail ou WhatsApp. Mesmo que alguém descubra sua senha, não entra na conta."}</p>
        </div>
        {mode === "idle" && (on
          ? <span className="ct-acts"><button className="ct-b" type="button" onClick={() => { setMode("pick"); setErr(null); }}>Trocar</button><button className="ct-b ghost" type="button" onClick={() => { setMode("off"); setTo(""); setErr(null); }}>Desligar</button></span>
          : <button className="ct-b dark" type="button" onClick={() => setMode("pick")}>Ligar agora</button>)}
      </div>

      {mode === "pick" && (
        <div className="ct-sub">
          <div className="ct-opts" role="radiogroup" aria-label="Como receber o código">
            <button type="button" role="radio" aria-checked={method === "email"} className={method === "email" ? "ct-opt on" : "ct-opt"} onClick={() => setMethod("email")}>
              <span className="ct-opt-i" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg></span>
              <b>E-mail</b><small>{email}</small>
            </button>
            <button type="button" role="radio" aria-checked={method === "whatsapp"} disabled={!whatsapp} className={method === "whatsapp" ? "ct-opt on" : "ct-opt"} onClick={() => setMethod("whatsapp")}>
              <span className="ct-opt-i wa" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5zm0 17.3c-1.5 0-3-.4-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A7.8 7.8 0 1 1 12 19.8zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8.9-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1s.2-1 .1-1.1-.2-.2-.4-.3z" /></svg></span>
              <b>WhatsApp</b><small>{whatsapp ? "Código no seu celular" : "Em breve"}</small>
            </button>
          </div>
          {method === "whatsapp" && whatsapp && (
            <label className="ct-f"><span className="ct-l">Celular com WhatsApp</span><input className="ct-in" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(maskPhone(e.target.value))} placeholder="(11) 98765-4321" autoComplete="tel-national" /></label>
          )}
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={reset}>Cancelar</button>
            <button className="ct-b dark" type="button" onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Enviar código"}</button>
          </div>
        </div>
      )}

      {(mode === "code" || mode === "off") && (
        <div className="ct-sub">
          {mode === "off" && !to ? (
            <p className="ct-note">Para desligar, confirme com um código enviado para o seu método atual.</p>
          ) : (
            <>
              <p className="ct-note">Digite o código que enviamos {method === "whatsapp" && mode === "code" ? "pelo WhatsApp " : ""}para <b>{to}</b>.</p>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void confirm(v)} disabled={busy} />
            </>
          )}
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={reset}>Cancelar</button>
            {mode === "off" && !to
              ? <button className="ct-b dark" type="button" onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Enviar código"}</button>
              : <button className="ct-b dark" type="button" onClick={() => void confirm()} disabled={busy || code.length !== 6}>{busy ? "Confirmando…" : mode === "off" ? "Desligar" : "Ativar"}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

function PasswordCard() {
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [conf, setConf] = useState("");
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nw.length < 8) { setErr("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (nw !== conf) { setErr("A confirmação não bate com a nova senha."); return; }
    setBusy(true); setErr(null);
    const r = await changePassword(cur, nw, others);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não foi possível trocar a senha."); return; }
    flash("Senha alterada");
    setOpen(false); setCur(""); setNw(""); setConf("");
  }

  return (
    <section className="ct-card" aria-labelledby="pw-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="pw-t">Senha</h2>
          <p className="ct-v">Use uma senha longa, que você não usa em outros sites.</p>
        </div>
        {!open && <button className="ct-b" type="button" onClick={() => setOpen(true)}>Trocar senha</button>}
      </div>
      {open && (
        <form className="ct-sub" onSubmit={save} noValidate>
          <div className="ct-grid">
            <label className="ct-f span2"><span className="ct-l">Senha atual</span><input className="ct-in" type="password" value={cur} onChange={(e) => { setCur(e.target.value); setErr(null); }} autoComplete="current-password" autoFocus /></label>
            <label className="ct-f"><span className="ct-l">Nova senha</span><input className="ct-in" type="password" value={nw} onChange={(e) => { setNw(e.target.value); setErr(null); }} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" /></label>
            <label className="ct-f"><span className="ct-l">Confirme a nova senha</span><input className="ct-in" type="password" value={conf} onChange={(e) => { setConf(e.target.value); setErr(null); }} autoComplete="new-password" /></label>
          </div>
          <label className="ct-check"><input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Desconectar os outros aparelhos</label>
          <p className="ct-note">Entrou só com o Google e não tem senha? <Link href="/esqueci-senha">Crie uma por aqui</Link>.</p>
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={() => { setOpen(false); setErr(null); }}>Cancelar</button>
            <button className="ct-b dark" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

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
