"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { authorizeEmailChange, confirmNewEmail, requestNewEmail, resendEmailChangeCode, saveProfile, setAvatar, startEmailChange } from "@/lib/actions/conta";
import { ResendButton } from "@/components/auth/resend";
import { useToast } from "@/components/toast";
import { PhoneField } from "@/components/phone-field";
import { CitySelect, UfSelect } from "@/components/city-select";
import { CodeBoxes } from "@/components/auth/verify-form";
import type { UserAddress } from "@/db/schema";

type Initial = { name: string; email: string; phone: string; cpf: string; birthDate: string; avatar: string | null; address: UserAddress | null; verified: boolean };

const maskCpf = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
const maskCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
const EMPTY: UserAddress = { cep: "", street: "", number: "", complement: "", district: "", city: "", uf: "" };

export function ContaDados({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { flash } = useToast();
  const [f, setF] = useState({ name: initial.name, phone: initial.phone, cpf: maskCpf(initial.cpf), birthDate: initial.birthDate });
  const [addr, setAddr] = useState<UserAddress>(initial.address ? { ...EMPTY, ...initial.address, cep: maskCep(initial.address.cep) } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatar, setAv] = useState(initial.avatar);
  const [upl, setUpl] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const numRef = useRef<HTMLInputElement>(null);
  const [cepBusy, setCepBusy] = useState(false);

  const hasAddr = Object.entries(addr).some(([k, v]) => k !== "uf" && !!v?.trim());
  const set = (patch: Partial<typeof f>) => { setF((o) => ({ ...o, ...patch })); setErr(null); };
  const setA = (patch: Partial<UserAddress>) => { setAddr((o) => ({ ...o, ...patch })); setErr(null); };

  async function lookupCep(v: string) {
    const d = v.replace(/\D/g, "");
    if (d.length !== 8) return;
    setCepBusy(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) setErr("CEP não encontrado. Preencha o endereço à mão.");
      else { setA({ street: j.logradouro || addr.street, district: j.bairro || addr.district, city: j.localidade || addr.city, uf: j.uf || addr.uf }); numRef.current?.focus(); }
    } catch { /* sem internet para o ViaCEP: preenche à mão */ }
    setCepBusy(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await saveProfile({ ...f, address: hasAddr ? addr : null }).catch(() => ({ ok: false, error: "Não foi possível salvar agora." }));
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Confira os dados."); return; }
    flash("Dados salvos");
    router.refresh();
  }

  async function pickPhoto(fl: File | undefined) {
    if (!fl) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(fl.type)) { flash("Envie JPG, PNG ou WebP."); return; }
    setUpl(true);
    const fd = new FormData();
    fd.append("file", fl);
    const r = await fetch("/api/midia", { method: "POST", body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (j?.url) { const s = await setAvatar(j.url); if (s.ok) { setAv(j.url); router.refresh(); } else flash(s.error ?? "Não foi possível salvar a foto."); }
    else flash(j?.error ?? "Não foi possível enviar a foto.");
    setUpl(false);
    if (file.current) file.current.value = "";
  }

  const initials = f.name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "TW";
  return (
    <>
      <header className="ct-head">
        <h1 className="ct-t">Meus dados</h1>
        <p className="ct-s">Seus dados aparecem nos ingressos e ajudam a confirmar que a conta é sua.</p>
      </header>

      <section className="ct-card" aria-labelledby="ft-t">
        <h2 className="ct-h" id="ft-t">Foto de perfil</h2>
        <div className="ct-photo">
          <span className="ct-av lg" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatar ? <img src={avatar} alt="" /> : initials}
          </span>
          <div className="ct-photo-a">
            <input ref={file} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Escolher foto" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <button className="ct-b" type="button" onClick={() => file.current?.click()} disabled={upl}>{upl ? "Enviando…" : avatar ? "Trocar foto" : "Enviar foto"}</button>
            {avatar && <button className="ct-b ghost" type="button" disabled={upl} onClick={async () => { const s = await setAvatar(null); if (s.ok) { setAv(null); router.refresh(); } }}>Remover</button>}
            <small>JPG, PNG ou WebP, até 10 MB.</small>
          </div>
        </div>
      </section>

      <EmailCard email={initial.email} verified={initial.verified} />

      <form className="ct-card" onSubmit={save} noValidate aria-labelledby="dp-t">
        <h2 className="ct-h" id="dp-t">Dados pessoais</h2>
        <div className="ct-grid">
          <label className="ct-f span2"><span className="ct-l">Nome completo</span><input className="ct-in" value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" maxLength={160} /></label>
          <div className="ct-f"><span className="ct-l">Celular</span><PhoneField className="ct-in" value={f.phone} onChange={(v) => set({ phone: v })} /></div>
          <label className="ct-f"><span className="ct-l">CPF</span><input autoComplete="off" className="ct-in" inputMode="numeric" value={f.cpf} onChange={(e) => set({ cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" /></label>
          <label className="ct-f"><span className="ct-l">Data de nascimento</span><input className="ct-in" type="date" value={f.birthDate} onChange={(e) => set({ birthDate: e.target.value })} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /></label>
        </div>

        <h2 className="ct-h ct-sep">Endereço</h2>
        <div className="ct-grid addr">
          <label className="ct-f"><span className="ct-l">CEP {cepBusy && <em>buscando…</em>}</span><input className="ct-in" inputMode="numeric" value={addr.cep} onChange={(e) => { const v = maskCep(e.target.value); setA({ cep: v }); void lookupCep(v); }} autoComplete="postal-code" placeholder="00000-000" /></label>
          <label className="ct-f span2"><span className="ct-l">Rua</span><input className="ct-in" value={addr.street} onChange={(e) => setA({ street: e.target.value })} autoComplete="address-line1" /></label>
          <label className="ct-f"><span className="ct-l">Número</span><input autoComplete="off" ref={numRef} className="ct-in" value={addr.number} onChange={(e) => setA({ number: e.target.value })} /></label>
          <label className="ct-f span2"><span className="ct-l">Complemento <em>opcional</em></span><input className="ct-in" value={addr.complement ?? ""} onChange={(e) => setA({ complement: e.target.value })} autoComplete="address-line2" placeholder="Apto, bloco, referência" /></label>
          <label className="ct-f"><span className="ct-l">Bairro</span><input autoComplete="off" className="ct-in" value={addr.district} onChange={(e) => setA({ district: e.target.value })} /></label>
          <label className="ct-f"><span className="ct-l">Estado</span><UfSelect className="ct-in" value={addr.uf} onChange={(uf) => setA({ uf })} /></label>
          <label className="ct-f"><span className="ct-l">Cidade</span><CitySelect className="ct-in" uf={addr.uf} value={addr.city} onChange={(city) => setA({ city })} /></label>
        </div>

        {err && <p className="ct-err" role="alert">{err}</p>}
        <div className="ct-act"><button className="ct-b dark" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar dados"}</button></div>
      </form>
    </>
  );
}

/** E-mail de acesso: código no e-mail atual autoriza; depois código no e-mail novo confirma. */
function EmailCard({ email, verified }: { email: string; verified: boolean }) {
  const router = useRouter();
  const { flash } = useToast();
  type Step = "idle" | "auth" | "new" | "verify";
  const [step, setStep] = useState<Step>("idle");
  const [to, setTo] = useState("");
  const [next, setNext] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => { setStep("idle"); setCode(""); setNext(""); setErr(null); };
  const fail = (e?: string) => { setErr(e ?? "Não deu certo. Tente de novo."); setCode(""); };

  async function begin() {
    setBusy(true); setErr(null);
    const r = await startEmailChange();
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setTo(r.to ?? ""); setCode(""); setStep("auth");
  }
  async function authorize(v = code) {
    if (busy || v.length !== 6) return;
    setBusy(true); setErr(null);
    const r = await authorizeEmailChange(v);
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    setCode(""); setStep("new");
  }
  async function sendNew() {
    const v = next.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr("Digite um e-mail válido."); return false; }
    if (v === email.toLowerCase()) { setErr("Este já é o seu e-mail."); return false; }
    setBusy(true); setErr(null);
    const r = await requestNewEmail(v).catch(() => ({ ok: false, error: "Não foi possível enviar o código agora." }));
    setBusy(false);
    if (!r.ok) { fail(r.error); return false; }
    setCode(""); setStep("verify");
    return true;
  }
  async function confirm(v = code) {
    if (busy || v.length !== 6) return;
    setBusy(true); setErr(null);
    const r = await confirmNewEmail(v).catch(() => ({ ok: false, error: "Não foi possível trocar agora." }));
    setBusy(false);
    if (!r.ok) { fail(r.error); return; }
    flash("E-mail alterado");
    close();
    router.refresh();
  }

  return (
    <section className="ct-card" aria-labelledby="em-t">
      <div className="ct-row">
        <div>
          <h2 className="ct-h" id="em-t">E-mail de acesso</h2>
          <p className="ct-v">{email} {verified ? <span className="ct-pill ok">Confirmado</span> : <a className="ct-pill warn" href="/ativar-conta">Confirmar</a>}</p>
        </div>
        {step === "idle" && <button className="ct-b" type="button" onClick={() => void begin()} disabled={busy}>{busy ? "Enviando…" : "Alterar e-mail"}</button>}
      </div>
      {step === "idle" && err && <p className="ct-err" role="alert">{err}</p>}
      {step !== "idle" && (
        <div className="ct-sub">
          <ol className="ct-prog" aria-label="Etapas">
            <li className={step === "auth" ? "on" : "ok"}>Confirmar que é você</li>
            <li className={step === "new" ? "on" : step === "verify" ? "ok" : undefined}>E-mail novo</li>
            <li className={step === "verify" ? "on" : undefined}>Confirmar e-mail novo</li>
          </ol>
          {step === "auth" && (
            <>
              <p className="ct-note">Por segurança, mandamos um código para o seu e-mail atual, <b>{to}</b>. Digite para autorizar a troca.</p>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void authorize(v)} disabled={busy} />
              <ResendButton className="ct-link" onResend={async () => { const r = await resendEmailChangeCode(); if (!r.ok) setErr(r.error ?? null); return r.ok; }} />
            </>
          )}
          {step === "new" && (
            <>
              <label className="ct-f"><span className="ct-l">Novo e-mail</span><input className="ct-in" type="email" value={next} onChange={(e) => { setNext(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendNew(); } }} autoComplete="email" autoFocus placeholder="nome@email.com" /></label>
              <p className="ct-note">Vamos mandar um código para o e-mail novo. O atual recebe um aviso da troca.</p>
            </>
          )}
          {step === "verify" && (
            <>
              <p className="ct-note">Digite o código que enviamos para <b>{next.trim().toLowerCase()}</b>.</p>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr(null); }} onDone={(v) => void confirm(v)} disabled={busy} />
              <span className="ct-acts">
                <ResendButton className="ct-link" onResend={sendNew} />
                <button className="ct-link" type="button" onClick={() => { setStep("new"); setCode(""); setErr(null); }}>Corrigir o e-mail</button>
              </span>
            </>
          )}
          {err && <p className="ct-err" role="alert">{err}</p>}
          <div className="ct-act">
            <button className="ct-b ghost" type="button" onClick={close}>Cancelar</button>
            {step === "auth" && <button className="ct-b dark" type="button" onClick={() => void authorize()} disabled={busy || code.length !== 6}>{busy ? "Confirmando…" : "Continuar"}</button>}
            {step === "new" && <button className="ct-b dark" type="button" onClick={() => void sendNew()} disabled={busy}>{busy ? "Enviando…" : "Enviar código"}</button>}
            {step === "verify" && <button className="ct-b dark" type="button" onClick={() => void confirm()} disabled={busy || code.length !== 6}>{busy ? "Confirmando…" : "Confirmar troca"}</button>}
          </div>
        </div>
      )}
    </section>
  );
}
