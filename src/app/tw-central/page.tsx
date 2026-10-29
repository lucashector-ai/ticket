import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminApps, AdminPayouts } from "@/components/admin/actions";
import { ADMIN_PATH, adminApplications, adminEvents, adminOverview, adminPayouts, adminUser, adminUsers } from "@/lib/admin";
import { destLabel } from "@/lib/bank";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Central", robots: { index: false, follow: false } };

const TABS = [["geral", "Visão geral"], ["inscricoes", "Inscrições"], ["saques", "Saques"], ["contas", "Contas"], ["eventos", "Eventos"]] as const;
const day = (d: Date | string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(".", "");

/** Central da Tickets Win (secreta): só para os e-mails de admin, com app autenticador. */
export default async function Central({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string }> }) {
  const admin = await adminUser();
  if (!admin) notFound();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "geral";
  const q = (sp.q ?? "").slice(0, 80);
  const ov = await adminOverview();

  return (
    <div className="pg-adm">
      <header className="ad-top">
        <Link href={ADMIN_PATH} className="ad-brand"><b>Tickets Win</b><span>Central</span></Link>
        <nav className="ad-tabs" aria-label="Seções">
          {TABS.map(([k, l]) => (
            <Link key={k} href={`${ADMIN_PATH}?aba=${k}`} className={tab === k ? "on" : undefined}>
              {l}{k === "inscricoes" && ov.pendingApps > 0 && <i>{ov.pendingApps}</i>}{k === "saques" && ov.pendingPayouts > 0 && <i>{ov.pendingPayouts}</i>}
            </Link>
          ))}
        </nav>
        <span className="ad-me">{admin.email}</span>
      </header>

      <main className="ad-main">
        {!admin.secure && <p className="ad-warn">Para aprovar inscrições e saques, ative o app autenticador em <Link href="/conta/seguranca">Minha conta → Privacidade e segurança</Link>.</p>}

        {tab === "geral" && (
          <section className="ad-kpis">
            {[
              ["Contas criadas", ov.users.toLocaleString("pt-BR")], ["Produtores", ov.producers.toLocaleString("pt-BR")], ["Eventos publicados", ov.events.toLocaleString("pt-BR")],
              ["Pedidos pagos", ov.orders.toLocaleString("pt-BR")], ["Vendido (GMV)", brl(ov.gmv)], ["Taxas pagas por compradores", brl(ov.buyerFees)],
              ["Inscrições pendentes", String(ov.pendingApps)], ["Saques pendentes", `${ov.pendingPayouts} · ${brl(ov.pendingPayoutTotal)}`],
            ].map(([l, v]) => <div key={l} className="ad-kpi"><span>{l}</span><b>{v}</b></div>)}
          </section>
        )}

        {tab === "inscricoes" && <AdminApps rows={(await adminApplications()).map((a) => ({ ...a, createdAt: day(a.createdAt), reviewedAt: a.reviewedAt ? day(a.reviewedAt) : null, avgTicket: brl(a.avgTicketCents) }))} />}

        {tab === "saques" && <AdminPayouts rows={(await adminPayouts()).map((p) => ({ id: p.id, at: day(p.createdAt), amount: brl(p.amountCents), status: p.status, org: p.organizer?.name ?? "—", dest: p.destination ? [destLabel(p.destination), p.destination.pixKey ? `Pix: ${p.destination.pixKey}` : `${p.destination.bank ?? ""} ag ${p.destination.agency ?? ""} cc ${p.destination.account ?? ""} (${p.destination.kind ?? "corrente"})`, p.destination.holder ? `Titular: ${p.destination.holder}${p.destination.doc ? ` · ${p.destination.doc}` : ""}` : ""].filter(Boolean).join("\n") : "—", note: p.note }))} />}

        {tab === "contas" && (
          <section className="ad-card">
            <form className="ad-search" action={ADMIN_PATH}>
              <input type="hidden" name="aba" value="contas" />
              <input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" aria-label="Buscar contas" />
              <button type="submit">Buscar</button>
            </form>
            <div className="ad-tbl">
              <div className="ad-tr ad-th c5"><span>Conta</span><span>Criada</span><span>Acesso</span><span>Produtor</span><span>Compras</span></div>
              {(await adminUsers(q)).map((u) => (
                <div className="ad-tr c5" key={u.id}>
                  <span><b>{u.name || "—"}</b><small>{u.email}{u.verified ? " · confirmado" : ""}</small></span>
                  <span>{day(u.createdAt)}</span>
                  <span>{u.google ? "Google" : "Senha"}{u.mfa ? ` · 2 etapas (${u.mfa === "totp" ? "app" : "e-mail"})` : ""}</span>
                  <span>{u.producer ? "Sim" : "—"}</span>
                  <span>{u.paidOrders}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "eventos" && (
          <section className="ad-card">
            <div className="ad-tbl">
              <div className="ad-tr ad-th c5"><span>Evento</span><span>Data</span><span>Status</span><span>Pedidos</span><span>Vendido</span></div>
              {(await adminEvents()).map((e) => (
                <div className="ad-tr c5" key={e.id}>
                  <span><Link href={`/eventos/${e.slug}`} target="_blank"><b>{e.title}</b></Link><small>{e.organizer?.name ?? "—"}</small></span>
                  <span>{day(e.startAt)}</span><span>{e.status}</span><span>{e.orders}</span><span>{brl(e.total)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
