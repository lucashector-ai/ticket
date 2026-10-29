"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { saveSettings } from "@/lib/actions/painel";
import { slugify } from "@/lib/format";
import { useOrigin } from "./use-origin";
import { AGES } from "@/lib/criar/model";

type Form = {
  name: string; slug: string; contactEmail: string; legalName: string; cnpj: string;
  payout: { bank: string; agency: string; account: string; kind: "corrente" | "poupanca"; holder: string; doc: string; pixKey: string };
  defaults: { buyerPaysFee: boolean; autoMeia: boolean; age: (typeof AGES)[number]; refund: string };
};

export function PainelConfig({ initial, hasOrg }: { initial: Form; hasOrg: boolean }) {
  const router = useRouter();
  const { flash } = useToast();
  const [f, setF] = useState<Form>(() => ({ ...initial, slug: initial.slug || slugify(initial.name) }));
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();
  const set = (p: Partial<Form>) => { setF((o) => ({ ...o, ...p })); setDirty(true); };
  const pay = (p: Partial<Form["payout"]>) => set({ payout: { ...f.payout, ...p } });
  const def = (p: Partial<Form["defaults"]>) => set({ defaults: { ...f.defaults, ...p } });
  const save = () => start(async () => {
    const r = await saveSettings(f);
    if (!r.ok) { flash(r.error); return; }
    setDirty(false); flash("Configurações salvas."); router.refresh();
  });
  const host = useOrigin().replace(/^https?:\/\//, "");

  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">Configurações</h1><p className="pg-s">Dados da sua produtora, conta de repasse e padrões dos eventos</p></div></div>
      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Perfil</h2><span className="card-s">Foto, capa, sobre e redes você edita direto na sua página.</span></div>{hasOrg && <Link className="b2" href={`/produtor/${initial.slug}`}>Ver minha página</Link>}</div>
            <div className="frm">
              <label className="fld"><span>Nome da produtora</span><input value={f.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="fld"><span>Endereço da página</span>
                <span className="pfx"><em>{host}/produtor/</em><input value={f.slug} maxLength={60} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></span>
                <small>Trocar o endereço quebra links antigos que você já divulgou.</small>
              </label>
              <label className="fld"><span>E-mail de contato</span><input type="email" value={f.contactEmail} maxLength={254} onChange={(e) => set({ contactEmail: e.target.value })} /></label>
            </div>
          </section>

          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Conta de repasse</h2><span className="card-s">Para onde vão os saques do Banco Tickets Win. Só o dono vê.</span></div></div>
            <div className="frm">
              <div className="frm-2">
                <label className="fld"><span>Razão social</span><input value={f.legalName} maxLength={200} onChange={(e) => set({ legalName: e.target.value })} /></label>
                <label className="fld"><span>CNPJ</span><input value={f.cnpj} maxLength={20} inputMode="numeric" onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0001-00" /></label>
              </div>
              <div className="frm-3">
                <label className="fld"><span>Banco</span><input value={f.payout.bank} maxLength={80} onChange={(e) => pay({ bank: e.target.value })} placeholder="Itaú, Nubank, Inter…" /></label>
                <label className="fld"><span>Agência</span><input value={f.payout.agency} maxLength={12} inputMode="numeric" onChange={(e) => pay({ agency: e.target.value })} /></label>
                <label className="fld"><span>Conta</span><input value={f.payout.account} maxLength={24} onChange={(e) => pay({ account: e.target.value })} /></label>
              </div>
              <div className="frm-3">
                <label className="fld"><span>Tipo</span><select value={f.payout.kind} onChange={(e) => pay({ kind: e.target.value as "corrente" | "poupanca" })}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option></select></label>
                <label className="fld"><span>Titular</span><input value={f.payout.holder} maxLength={160} onChange={(e) => pay({ holder: e.target.value })} /></label>
                <label className="fld"><span>CPF ou CNPJ do titular</span><input value={f.payout.doc} maxLength={20} inputMode="numeric" onChange={(e) => pay({ doc: e.target.value })} /></label>
              </div>
              <label className="fld"><span>Chave Pix (opcional)</span><input value={f.payout.pixKey} maxLength={140} onChange={(e) => pay({ pixKey: e.target.value })} placeholder="E-mail, celular, CPF/CNPJ ou chave aleatória" /></label>
            </div>
          </section>
        </div>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Padrões dos eventos novos</h2><span className="card-s">Já vêm preenchidos ao criar um evento; dá para mudar em cada um.</span></div></div>
            <div className="frm">
              <label className="tg2"><span><b>Comprador paga a taxa</b><small>{f.defaults.buyerPaysFee ? "A taxa de 7,99% vai à parte no checkout." : "Você absorve os 7,99%: o preço já inclui a taxa."}</small></span><input className="sr" type="checkbox" checked={f.defaults.buyerPaysFee} onChange={(e) => def({ buyerPaysFee: e.target.checked })} /><span className="sw" aria-hidden="true" /></label>
              <label className="tg2"><span><b>Meia-entrada automática</b><small>Cria a meia (50%) para cada inteira.</small></span><input className="sr" type="checkbox" checked={f.defaults.autoMeia} onChange={(e) => def({ autoMeia: e.target.checked })} /><span className="sw" aria-hidden="true" /></label>
              <label className="fld"><span>Classificação</span><select value={f.defaults.age} onChange={(e) => def({ age: e.target.value as Form["defaults"]["age"] })}>{AGES.map((a) => <option key={a}>{a}</option>)}</select></label>
              <label className="fld"><span>Política de reembolso</span><textarea value={f.defaults.refund} maxLength={300} onChange={(e) => def({ refund: e.target.value })} /></label>
            </div>
          </section>
        </aside>
      </div>
      {dirty && (
        <div className="save-bar">
          <span>Você tem alterações não salvas.</span>
          <button className="b2" type="button" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      )}
    </div>
  );
}
