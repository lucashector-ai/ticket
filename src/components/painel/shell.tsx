"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { OrgSwitch, type OrgItem } from "./org-switch";

const ICON = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  fin: "M3 6h18v13H3zM3 10h18M7 15h4",
  pub: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  prom: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2.5 21v-1a6.5 6.5 0 0 1 10-5.5M17.5 13l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z",
  mail: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3.5 6.5l8.5 6.5 8.5-6.5",
  mkt: "M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12",
  team: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M9 12l2 2 4-4",
  cfg: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
};
const NAV: { href: string; label: string; icon: keyof typeof ICON }[] = [
  { href: "/painel", label: "Início", icon: "home" },
  { href: "/painel/financeiro", label: "Financeiro", icon: "fin" },
  { href: "/painel/publico", label: "Público", icon: "pub" },
  { href: "/painel/marketing", label: "Marketing", icon: "mkt" },
  { href: "/painel/promoters", label: "Promoters", icon: "prom" },
  { href: "/painel/emails", label: "E-mails", icon: "mail" },
  { href: "/painel/equipe", label: "Equipe e check-in", icon: "team" },
  { href: "/painel/configuracoes", label: "Configurações", icon: "cfg" },
];

/** Barra do topo + menu lateral do painel (layout do design "painel do produtor"). */
export function PainelShell({ role, orgName, orgInitials, orgSlug, userName, payoutMissing = false, orgs = [], activeId = null, canCreateOrg = false, maxOrgs = 3, children }: {
  role: "owner" | "admin" | "portaria"; orgName: string; orgInitials: string; orgSlug: string | null; userName: string; payoutMissing?: boolean;
  /** produtoras da conta (seletor no topo); vazio = conta ainda sem produtora */
  orgs?: OrgItem[]; activeId?: string | null; canCreateOrg?: boolean; maxOrgs?: number; children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  // celular: o menu vira uma faixa rolável; a página atual sempre à vista (ex.: "Equipe e check-in" ficava fora)
  const side = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = side.current, on = n?.querySelector<HTMLElement>(".nv.cur");
    if (!n || !on || n.scrollWidth <= n.clientWidth) return;
    const a = n.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left < a.left || r.right > a.right) n.scrollBy({ left: r.left - a.left - (a.width - r.width) / 2 });
  }, [path]);
  const cur = (href: string) => (href === "/painel" ? path === "/painel" || path.startsWith("/painel/evento") : path.startsWith(href));
  return (
    <div className="pd">
      <header className="pd-top">
        <Link className="pd-logo" href="/painel" aria-label="Tickets Win · painel do produtor"><BrandLogo height={20} /><span className="pd-tag">Produtor</span></Link>
        <form className="pd-search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/painel?q=${encodeURIComponent(q.trim())}`); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
          <input autoComplete="off" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento" aria-label="Buscar evento" />
        </form>
        <div className="pd-tr">
          {orgSlug && <Link className="pd-site" href={`/produtor/${orgSlug}`}>Ver minha página</Link>}
          <Link className="pd-site" href="/">Ir para o site</Link>
          {orgs.length && activeId
            ? <OrgSwitch orgs={orgs} activeId={activeId} userName={userName} canCreate={canCreateOrg} max={maxOrgs} />
            : <span className="pd-me"><span className="pd-av">{orgInitials}</span><span className="pd-mi"><b className="pd-mn">{orgName}</b><span className="pd-ms">{userName} · {role === "owner" ? "Dono" : role === "admin" ? "Admin" : "Portaria"}</span></span></span>}
        </div>
      </header>
      <div className="pd-shell">
        <nav className="pd-side" aria-label="Menu do produtor" ref={side}>
          {role !== "portaria" && <Link className="pd-new" href="/criar-evento"><svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>Criar evento</Link>}
          {NAV.filter((n) => role !== "portaria" || n.icon === "team").filter((n) => role === "owner" || n.icon !== "cfg").map((n) => (
            <Link key={n.href} className={cur(n.href) ? "nv cur" : "nv"} href={n.href} aria-current={cur(n.href) ? "page" : undefined}>
              <span className="nvi" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n.icon]} /></svg></span>{n.label}
              {payoutMissing && n.icon === "cfg" && <span className="nv-dot" aria-label="Falta preencher os dados de recebimento" />}
            </Link>
          ))}
          <div className="pd-plan">
            <span className="plan-k">Seu plano</span>
            <b className="plan-t">Taxa de 7,99% por ingresso</b>
            <span className="plan-s">Paga pelo comprador ou absorvida por você, como você escolher em cada evento.</span>
          </div>
        </nav>
        <main className="pd-main">
          {payoutMissing && (
            <div className="pd-alert" role="status">
              <span className="pd-alert-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M2 21h20M12 2.5 21 7H3z" /></svg></span>
              <div className="pd-alert-t"><b>Cadastre onde você vai receber as vendas</b><span>Preencha a conta de recebimento (banco ou Pix), o titular e o CPF ou CNPJ. Sem isso não dá para sacar o dinheiro dos ingressos.</span></div>
              <Link className="b2 dark" href="/painel/configuracoes#recebimento">Preencher dados de recebimento</Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
