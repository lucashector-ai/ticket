type Props = {
  url: string; hasPassword: boolean; hasApp: boolean; available: string; pending: string; inFlight: string; paidOut: string;
  nextRelease: string | null; destination: string | null; releaseDays: number;
  payouts: { id: string; at: string; amount: string; status: string }[];
};

const ST: Record<string, string> = { requested: "Em análise", processing: "Processando", paid: "Pago", rejected: "Recusado", cancelled: "Cancelado" };

/**
 * Recebimentos no painel: saldo, saques recentes e o atalho para o Banco Tickets Win.
 * A senha do banco não é criada aqui: só dentro do banco, com código no e-mail e app autenticador.
 */
export function BancoCard(p: Props) {
  const ready = p.hasPassword && p.hasApp && !!p.destination;
  const steps = [
    { ok: p.hasApp, t: "App autenticador na sua conta", href: "/conta/seguranca", cta: "Cadastrar" },
    { ok: !!p.destination, t: "Conta para receber", href: "/painel/configuracoes", cta: "Cadastrar" },
    { ok: p.hasPassword, t: "Acesso ao banco (senha própria)", href: `${p.url}/criar`, cta: "Criar no banco", ext: true },
  ];
  return (
    <section className="bkc">
      <div className="bkc-top">
        <div className="bkc-bal">
          <span className="bkc-k">Disponível para saque</span>
          <b className="bkc-v">{p.available}</b>
          <span className="bkc-s">{p.destination ? <>Recebe em <b>{p.destination}</b></> : "Conta para receber ainda não cadastrada"}</span>
        </div>
        <div className="bkc-a">
          <a className={ready ? "bkc-go" : "bkc-go off"} href={ready ? `${p.url}/entrar` : undefined} target="_blank" rel="noopener" aria-disabled={!ready}>
            Abrir Banco Tickets Win
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11l6-6M6 5h5v5" /></svg>
          </a>
          <small>Saques só no banco, com senha própria e app autenticador.</small>
        </div>
      </div>
      <div className="bkc-mini">
        <div><span>A liberar</span><b>{p.pending}</b><small>{p.nextRelease ? `próxima em ${p.nextRelease}` : `${p.releaseDays} dias após cada evento`}</small></div>
        <div><span>Em saque</span><b>{p.inFlight}</b><small>pedidos em análise</small></div>
        <div><span>Já recebido</span><b>{p.paidOut}</b><small>saques pagos</small></div>
      </div>
      {!ready && (
        <div className="bkc-steps">
          <b>Para liberar o banco</b>
          {steps.map((s) => (
            <div key={s.t} className={s.ok ? "ok" : undefined}>
              <span className="bkc-ck" aria-hidden="true">{s.ok ? "✓" : ""}</span>
              <span>{s.t}</span>
              {!s.ok && <a href={s.href} target={s.ext ? "_blank" : undefined} rel={s.ext ? "noopener" : undefined}>{s.cta}</a>}
            </div>
          ))}
        </div>
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
