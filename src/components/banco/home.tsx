"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { bankLogout, cancelPayout, requestPayout } from "@/lib/actions/banco";
import type { BankEntry } from "@/lib/bank";
import { CodeBoxes } from "@/components/auth/verify-form";
import { BancoMark } from "./mark";

type Props = {
  base: string; name: string; email: string; configUrl: string;
  wallet: { available: number; pending: number; paidOut: number; inFlight: number; nextRelease: string | null; testSales: number; entries: BankEntry[]; destination: string | null } | null;
  rules: { min: number; releaseDays: number };
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
const dayTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(".", "");
const STATUS: Record<BankEntry["status"], string> = { liberado: "Liberado", "a liberar": "A liberar", requested: "Em análise", processing: "Processando", paid: "Pago", rejected: "Recusado", cancelled: "Cancelado" };
/** "1.234,56" → centavos */
const toCents = (v: string) => { const d = v.replace(/\D/g, ""); return d ? Number(d) : 0; };
const fmtInput = (c: number) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export function BancoHome({ base, name, email, configUrl, wallet, rules }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<"tudo" | "entradas" | "saidas">("tudo");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const list = useMemo(() => (wallet?.entries ?? []).filter((e) => filter === "tudo" || (filter === "entradas" ? e.kind === "venda" : e.kind === "saque")), [wallet, filter]);

  async function logout() { await bankLogout(); router.replace(`${base}/entrar`); }
  async function withdraw(v = code) {
    if (v.length !== 6 || busy) return;
    setBusy(true); setMsg(null);
    const r = await requestPayout(amount, v);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, t: r.error ?? "Não foi possível pedir o saque." }); setCode(""); return; }
    setMsg({ ok: true, t: `Saque de ${brl(amount)} pedido. Cai em até 2 dias úteis.` });
    setOpen(false); setAmount(0); setCode("");
    router.refresh();
  }
  async function cancel(id: string) {
    const r = await cancelPayout(id);
    setMsg(r.ok ? { ok: true, t: "Saque cancelado. O valor voltou para o saldo." } : { ok: false, t: r.error ?? "Não foi possível cancelar." });
    router.refresh();
  }

  if (!wallet) {
    return (
      <main className="bk">
        <Top name={name} email={email} onLogout={logout} />
        <section className="bk-empty"><b>Sem eventos por aqui</b><p>O Banco Tickets Win mostra o dinheiro dos eventos de quem é dono da produtora.</p></section>
      </main>
    );
  }
  const w = wallet;
  const canWithdraw = w.available >= rules.min && !!w.destination;
  return (
    <main className="bk">
      <Top name={name} email={email} onLogout={logout} />

      <section className="bk-hero">
          <div className="bk-bal">
          <span className="bk-k">Saldo disponível</span>
          <b className="bk-v">{brl(w.available)}</b>
          <span className="bk-n">{w.destination ? <>Saque para <b>{w.destination}</b></> : <>Cadastre a conta para receber em <a href={configUrl}>Configurações</a></>}</span>
        </div>
        <div className="bk-hero-a">
          <button className="bk-go" type="button" disabled={!canWithdraw} onClick={() => { setOpen((o) => !o); setAmount(w.available); setMsg(null); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
            Pedir saque
          </button>
          {!canWithdraw && <small>{!w.destination ? "Falta a conta para receber." : `Saque mínimo de ${brl(rules.min)}.`}</small>}
        </div>
        <div className="bk-mini">
          <div><span>A liberar</span><b>{brl(w.pending)}</b><small>{w.nextRelease ? `próxima liberação em ${day(w.nextRelease)}` : "nenhuma venda aguardando"}</small></div>
          <div><span>Em saque</span><b>{brl(w.inFlight)}</b><small>pedidos em análise</small></div>
          <div><span>Já recebido</span><b>{brl(w.paidOut)}</b><small>saques pagos</small></div>
        </div>
      </section>

      {open && (
        <section className="bk-card bk-wd" aria-labelledby="wd-t">
          <h2 className="bk-h" id="wd-t">Quanto você quer sacar?</h2>
          <label className="bk-amt">
            <span>R$</span>
            <input inputMode="numeric" value={fmtInput(amount)} onChange={(e) => setAmount(Math.min(toCents(e.target.value), w.available))} aria-label="Valor do saque" autoFocus />
          </label>
          <div className="bk-chips">
            {[0.25, 0.5, 1].map((f) => <button key={f} type="button" className={amount === Math.floor(w.available * f) ? "on" : undefined} onClick={() => setAmount(Math.floor(w.available * f))}>{f === 1 ? "Tudo" : `${f * 100}%`}</button>)}
          </div>
          <p className="bk-note">Vai para <b>{w.destination}</b>. Cai em até 2 dias úteis. Você pode cancelar enquanto o pedido estiver em análise.</p>
          <p className="bk-k bk-k2">Confirme com o código do app autenticador</p>
          <CodeBoxes value={code} onChange={setCode} onDone={(v) => void withdraw(v)} disabled={busy || amount < rules.min} autoFocus={false} />
          <div className="bk-act">
            <button className="bk-b ghost" type="button" onClick={() => { setOpen(false); setCode(""); }}>Cancelar</button>
            <button className="bk-go" type="button" disabled={busy || amount < rules.min || code.length !== 6} onClick={() => void withdraw()}>{busy ? "Pedindo…" : `Sacar ${brl(amount)}`}</button>
          </div>
        </section>
      )}
      {msg && <p className={msg.ok ? "bk-ok" : "bk-err"} role="status">{msg.t}</p>}

      <section className="bk-card" aria-labelledby="ex-t">
        <div className="bk-row">
          <h2 className="bk-h" id="ex-t">Extrato</h2>
          <div className="bk-tabs" role="tablist" aria-label="Filtrar extrato">
            {(["tudo", "entradas", "saidas"] as const).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : undefined} onClick={() => setFilter(f)}>{f === "tudo" ? "Tudo" : f === "entradas" ? "Entradas" : "Saídas"}</button>)}
          </div>
        </div>
        <ul className="bk-list">
          {list.map((e) => (
            <li key={e.id} className={e.kind}>
              <span className="bk-ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{e.kind === "venda" ? <path d="M17 7L7 17M15 17H7V9" /> : <path d="M7 17L17 7M9 7h8v8" />}</svg>
              </span>
              <span className="bk-lt2"><b>{e.kind === "venda" ? `Vendas · ${e.title}` : e.title}</b><small>{e.detail} · {dayTime(e.at)}</small></span>
              <span className="bk-lr">
                <b className={e.amount < 0 ? "neg" : "pos"}>{e.amount < 0 ? "−" : "+"}{brl(Math.abs(e.amount))}</b>
                <span className={`bk-st ${e.status.replace(" ", "-")}`}>{e.status === "a liberar" && e.releaseAt ? `Libera em ${day(e.releaseAt)}` : STATUS[e.status]}</span>
                {e.kind === "saque" && e.status === "requested" && <button className="bk-x" type="button" onClick={() => void cancel(e.id.slice(2))}>Cancelar</button>}
              </span>
            </li>
          ))}
          {!list.length && <li className="bk-none">{filter === "saidas" ? "Nenhum saque ainda." : "As vendas pagas dos seus eventos aparecem aqui."}</li>}
        </ul>
        {w.testSales > 0 && <p className="bk-note">{w.testSales} {w.testSales === 1 ? "venda de teste não entra" : "vendas de teste não entram"} no saldo.</p>}
      </section>

      <section className="bk-how">
        <div><b>1. Venda</b><span>Cada ingresso pago entra como “a liberar”, já sem a taxa da Tickets Win.</span></div>
        <div><b>2. Liberação</b><span>O valor fica disponível {rules.releaseDays} dias depois que o evento acaba.</span></div>
        <div><b>3. Saque</b><span>Peça quando quiser. O dinheiro cai na sua conta em até 2 dias úteis.</span></div>
      </section>
    </main>
  );
}

function Top({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
  return (
    <header className="bk-top">
      <BancoMark />
      <div className="bk-who"><span><b>{name}</b><small>{email}</small></span><button className="bk-b ghost sm" type="button" onClick={onLogout}>Sair</button></div>
    </header>
  );
}
