"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setBankPassword } from "@/lib/actions/banco";
import { useToast } from "@/components/toast";

type Props = {
  url: string; hasPassword: boolean; available: string; pending: string; inFlight: string; paidOut: string;
  nextRelease: string | null; destination: string | null; releaseDays: number;
  payouts: { id: string; at: string; amount: string; status: string }[];
};

const ST: Record<string, string> = { requested: "Em análise", processing: "Processando", paid: "Pago", rejected: "Recusado", cancelled: "Cancelado" };

/** Recebimentos no painel: saldo, saques recentes, senha e atalho para o Banco Tickets Win. */
export function BancoCard(p: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setErr("As senhas não batem."); return; }
    setBusy(true); setErr(null);
    const r = await setBankPassword(pw);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Não foi possível salvar."); return; }
    flash(p.hasPassword ? "Senha do banco trocada" : "Banco liberado");
    setOpen(false); setPw(""); setPw2("");
    router.refresh();
  }

  return (
    <section className="bkc">
      <div className="bkc-top">
        <div className="bkc-bal">
          <span className="bkc-k">Disponível para saque</span>
          <b className="bkc-v">{p.available}</b>
          <span className="bkc-s">{p.destination ? <>Recebe em <b>{p.destination}</b></> : <>Cadastre a conta para receber em <a href="/painel/configuracoes">Configurações</a></>}</span>
        </div>
        <div className="bkc-a">
          {p.hasPassword
            ? <a className="bkc-go" href={p.url} target="_blank" rel="noopener">Abrir Banco Tickets Win<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11l6-6M6 5h5v5" /></svg></a>
            : <button className="bkc-go" type="button" onClick={() => setOpen(true)}>Ativar Banco Tickets Win</button>}
          {p.hasPassword && <button className="bkc-lk" type="button" onClick={() => setOpen((o) => !o)}>Trocar senha do banco</button>}
        </div>
      </div>
      <div className="bkc-mini">
        <div><span>A liberar</span><b>{p.pending}</b><small>{p.nextRelease ? `próxima em ${p.nextRelease}` : `${p.releaseDays} dias após cada evento`}</small></div>
        <div><span>Em saque</span><b>{p.inFlight}</b><small>pedidos em análise</small></div>
        <div><span>Já recebido</span><b>{p.paidOut}</b><small>saques pagos</small></div>
      </div>
      {open && (
        <form className="bkc-pw" onSubmit={save} noValidate>
          <p>{p.hasPassword ? "Escolha uma nova senha para o banco." : "Crie a senha do Banco Tickets Win. Ela é separada da senha do site: no banco você entra com seu e-mail, essa senha e um código enviado por e-mail."}</p>
          <div className="bkc-pw-f">
            <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} placeholder="Senha do banco (letras e números)" autoComplete="new-password" aria-label="Senha do banco" />
            <input type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErr(null); }} placeholder="Repita a senha" autoComplete="new-password" aria-label="Repita a senha do banco" />
            <button className="b2 dark" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar senha"}</button>
          </div>
          {err && <p className="bkc-err" role="alert">{err}</p>}
        </form>
      )}
      {p.payouts.length > 0 && (
        <div className="bkc-list">
          <b>Saques recentes</b>
          {p.payouts.map((s) => <div key={s.id}><span>{s.at}</span><span className={`bkc-st ${s.status}`}>{ST[s.status] ?? s.status}</span><b>{s.amount}</b></div>)}
        </div>
      )}
    </section>
  );
}
