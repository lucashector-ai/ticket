"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/components/criar/shared";
import { useToast } from "@/components/toast";
import { updateProducerProfile } from "@/lib/actions/produtor";
import { CitySelect, UfSelect } from "@/components/city-select";

export type ProducerForm = {
  name: string; tagline: string; bio: string; cityName: string; uf: string;
  instagram: string; website: string; contactEmail: string; whatsapp: string;
  legalName: string; cnpj: string; avatarUrl: string | null; coverUrl: string | null;
  policies: { cancel: string; meia: string; transfer: string; access: string };
};

/** Painel "Editar perfil", como numa rede social: foto, capa, nome, bio, links e políticas. */
export function EditSheet({ orgId, initial, onClose, onSaved }: { orgId: string; initial: ProducerForm; onClose: () => void; onSaved: () => void }) {
  const { flash } = useToast();
  const [f, setF] = useState<ProducerForm>(() => ({
    name: initial.name, tagline: initial.tagline, bio: initial.bio, cityName: initial.cityName, uf: initial.uf,
    instagram: initial.instagram, website: initial.website, contactEmail: initial.contactEmail, whatsapp: initial.whatsapp,
    legalName: initial.legalName, cnpj: initial.cnpj, avatarUrl: initial.avatarUrl, coverUrl: initial.coverUrl, policies: { ...initial.policies },
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ProducerForm>) => setF((o) => ({ ...o, ...patch }));
  const setPol = (k: keyof ProducerForm["policies"], v: string) => setF((o) => ({ ...o, policies: { ...o.policies, [k]: v } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = ""; };
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    const r = await updateProducerProfile(orgId, f).catch(() => ({ ok: false as const, error: "Não foi possível salvar agora." }));
    setBusy(false);
    if (!r.ok) { flash(r.error); return; }
    flash("Perfil atualizado.");
    onSaved();
  };

  return (
    <>
      <div className="pe-ov" onClick={onClose} aria-hidden="true" />
      <div className="pe-sh" role="dialog" aria-modal="true" aria-labelledby="pe-t">
        <div className="pe-hd"><b id="pe-t">Editar perfil</b><button className="pe-x" type="button" onClick={onClose} aria-label="Fechar">✕</button></div>
        <div className="pe-bd">
          <div className="pe-imgs">
            <Pic label="Foto" cls="av" url={f.avatarUrl} onChange={(u) => set({ avatarUrl: u })} />
            <Pic label="Capa (1920 × 520)" cls="cv" url={f.coverUrl} onChange={(u) => set({ coverUrl: u })} />
          </div>
          <Field label="Nome"><input autoComplete="off" value={f.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Frase de apresentação" hint={`${f.tagline.length}/200 · aparece embaixo do nome`}><input autoComplete="off" value={f.tagline} maxLength={200} onChange={(e) => set({ tagline: e.target.value })} placeholder="Festas de house e techno no centro de SP desde 2019." /></Field>
          <Field label="Sobre" hint="Separe os parágrafos com uma linha em branco."><textarea value={f.bio} maxLength={4000} onChange={(e) => set({ bio: e.target.value })} placeholder="Conte a história, o estilo dos eventos e o que o público pode esperar." /></Field>
          <div className="pe-cu">
            <Field label="Estado"><UfSelect value={f.uf} onChange={(uf) => set({ uf })} /></Field>
            <Field label="Cidade"><CitySelect uf={f.uf} value={f.cityName} onChange={(cityName) => set({ cityName })} /></Field>
          </div>

          <span className="pe-sec">Contato e redes</span>
          <div className="pe-two">
            <Field label="Instagram"><input autoComplete="off" value={f.instagram} maxLength={120} onChange={(e) => set({ instagram: e.target.value })} placeholder="@seuperfil" /></Field>
            <Field label="Site"><input autoComplete="off" value={f.website} maxLength={200} onChange={(e) => set({ website: e.target.value })} placeholder="seusite.com.br" /></Field>
            <Field label="E-mail de contato"><input autoComplete="off" type="email" value={f.contactEmail} maxLength={254} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="contato@…" /></Field>
            <Field label="WhatsApp"><input autoComplete="off" value={f.whatsapp} maxLength={32} inputMode="tel" onChange={(e) => set({ whatsapp: e.target.value })} placeholder="(11) 90000-0000" /></Field>
          </div>

          <span className="pe-sec">Políticas padrão</span>
          <Field label="Cancelamento"><input autoComplete="off" value={f.policies.cancel} maxLength={400} onChange={(e) => setPol("cancel", e.target.value)} placeholder="Até 7 dias após a compra, com 48h de antecedência." /></Field>
          <Field label="Meia-entrada"><input autoComplete="off" value={f.policies.meia} maxLength={400} onChange={(e) => setPol("meia", e.target.value)} placeholder="Conforme a Lei 12.933. Documento na entrada." /></Field>
          <Field label="Transferência"><input autoComplete="off" value={f.policies.transfer} maxLength={400} onChange={(e) => setPol("transfer", e.target.value)} placeholder="Liberada em Meus ingressos até 2h antes." /></Field>
          <Field label="Acessibilidade"><input autoComplete="off" value={f.policies.access} maxLength={400} onChange={(e) => setPol("access", e.target.value)} placeholder="Rampas, banheiro adaptado e área reservada." /></Field>

          <span className="pe-sec">Empresa</span>
          <div className="pe-two">
            <Field label="Razão social"><input autoComplete="off" value={f.legalName} maxLength={200} onChange={(e) => set({ legalName: e.target.value })} /></Field>
            <Field label="CNPJ"><input autoComplete="off" value={f.cnpj} maxLength={20} inputMode="numeric" onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0001-00" /></Field>
          </div>
        </div>
        <div className="pe-ft">
          <button className="cc" type="button" onClick={onClose}>Cancelar</button>
          <button className="sv" type="button" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="pe-f"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Pic({ label, cls, url, onChange }: { label: string; cls: string; url: string | null; onChange: (u: string | null) => void }) {
  const { flash } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const r = await uploadImage(file);
    setBusy(false);
    if (ref.current) ref.current.value = "";
    if (!r.ok) { flash(r.error); return; }
    onChange(r.url);
  };
  return (
    <label className={`pe-img ${cls}`}>
      <input ref={ref} className="sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pick(e.target.files?.[0])} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" />}
      <span style={{ position: "relative", padding: "4px 10px", borderRadius: 999, background: url ? "rgba(255,255,255,.85)" : "transparent" }}>{busy ? "Enviando…" : url ? `Trocar ${label.split(" ")[0].toLowerCase()}` : label}</span>
    </label>
  );
}
