import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { BackToTop } from "@/components/back-to-top";
import { BRAND_SOCIAL } from "@/lib/mail/brand";
import { COMPANY, SUPPORT } from "@/lib/site";

const COLS: { h: string; links: [string, string][] }[] = [
  { h: "Explorar", links: [["Início", "/"], ["Explorar eventos", "/explorar"], ["Categorias", "/#categorias"], ["Em destaque", "/#destaque"]] },
  { h: "Para produtores", links: [["Vender ingressos", "/produtores"], ["Criar evento", "/criar-evento"], ["Meus eventos", "/meus-eventos"], ["Ajuda para produtores", "/ajuda#produtores"]] },
  { h: "Ajuda", links: [["Central de ajuda", "/ajuda"], ["Fale com a gente", "/contato"], ["Meus ingressos", "/meus-ingressos"], ["Reembolsos", "/ajuda#reembolsos"], ["Meia-entrada", "/ajuda#meia-entrada"]] },
  { h: "Institucional", links: [["Sobre nós", "/sobre"], ["Termos de uso", "/legal/termos"], ["Privacidade", "/legal/privacidade"], ["Cookies", "/legal/cookies"], ["Acessibilidade", "/legal/acessibilidade"]] },
];

const SOCIAL_ICON: Record<string, React.ReactNode> = {
  ig: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".6" fill="currentColor" /></>,
  tt: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.6 2.3 4.3 5 4.5" />,
  sp: <><circle cx="12" cy="12" r="9" /><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.8c2.5-.7 5.2-.4 7.3.8M8.6 15.8c2-.5 3.9-.3 5.5.6" /></>,
  yt: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></>,
};

const TRUST: { t: string; s: string; icon: React.ReactNode }[] = [
  { t: "Compra protegida", s: "Conexão segura e pagamento processado com criptografia.", icon: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></> },
  { t: "QR code antifraude", s: "Muda a cada transferência: print não entra no evento.", icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18z" /></> },
  { t: "Seus dados cuidados", s: "Tratamento conforme a LGPD e verificação em duas etapas.", icon: <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" /> },
];

export function SiteFooter() {
  const social = BRAND_SOCIAL.filter((s) => s.url);
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ft-head">
          <Link className="logo" href="/" aria-label="Tickets Win: voltar ao início">
            <BrandLogo height={26} />
          </Link>
          <BackToTop />
        </div>

        <div className="ft-grid">
          <div className="ft-cols">
            {COLS.map((c) => (
              <nav key={c.h} aria-label={c.h}>
                <h4>{c.h}</h4>
                <ul>{c.links.map(([t, href]) => <li key={href}><Link href={href}>{t}</Link></li>)}</ul>
              </nav>
            ))}
          </div>

          <aside className="ft-side" aria-label="Atendimento">
            <div className="ft-help">
              <h4>Atendimento</h4>
              <div className="ft-tiles">
                <Link className="ft-tile" href="/ajuda">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4" height="6" rx="2" /><rect x="17" y="13" width="4" height="6" rx="2" /><path d="M19 19c0 1.5-1.5 2.5-4 2.5h-2" /></svg>
                  Central de ajuda
                </Link>
                <a className="ft-tile" href={`${SUPPORT.whatsappUrl}?text=${encodeURIComponent("Oi! Preciso de ajuda com a Tickets Win.")}`} target="_blank" rel="noopener noreferrer">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z" /></svg>
                  WhatsApp
                </a>
              </div>
              <p><b>E-mail:</b> <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a></p>
              <p><b>WhatsApp:</b> <a href={SUPPORT.whatsappUrl} target="_blank" rel="noopener noreferrer">{SUPPORT.whatsapp}</a></p>
              <p>Respondemos em até 1 dia útil.</p>
            </div>
            <div className="ft-press">
              <h4>Imprensa e parcerias</h4>
              <a href={`mailto:${SUPPORT.press}`}>{SUPPORT.press}</a>
            </div>
            {social.length > 0 && (
              <div className="ft-press">
                <h4>Siga a Tickets Win</h4>
                <div className="soc">
                  {social.map((s) => (
                    <a key={s.icon} href={s.url} aria-label={s.label} target="_blank" rel="noopener noreferrer">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SOCIAL_ICON[s.icon]}</svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <ul className="ft-trust" aria-label="Segurança">
          {TRUST.map((x) => (
            <li key={x.t}>
              <span aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{x.icon}</svg></span>
              <b>{x.t}</b><small>{x.s}</small>
            </li>
          ))}
        </ul>

        <div className="fb">
          <span>© 2026 {COMPANY.legalName}. Todos os direitos reservados.</span>
          <span>{COMPANY.cnpj ? `CNPJ ${COMPANY.cnpj}` : "CNPJ em registro"} · {COMPANY.city} · Feito no Brasil</span>
        </div>
        <p className="ft-legal">
          A Tickets Win é a plataforma de venda e gestão de ingressos usada pelos produtores. Cada evento é organizado e de responsabilidade do seu produtor, identificado na página do evento. Dúvidas sobre o evento (horários, atrações, regras da casa) são com o produtor; sobre compra, pagamento, reembolso e conta, fale com a Tickets Win.
        </p>
      </div>
    </footer>
  );
}
