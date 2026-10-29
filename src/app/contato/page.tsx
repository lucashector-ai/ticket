import type { Metadata } from "next";
import Link from "next/link";
import { getHeaderUser, InstShell } from "@/components/inst-shell";
import { ContactForm } from "@/components/ajuda/contact-form";
import { HelpSearch } from "@/components/ajuda/help-search";
import { IcArrow, IcChevron, IcClock, IcMail, IcWhatsApp } from "@/components/ajuda/icons";
import { articleBySlug, searchIndex } from "@/lib/help/articles";
import { HELP_EMAIL, isSubject, WHATSAPP_DISPLAY, whatsappUrl } from "@/lib/help/contact";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Fale com o suporte da Tickets Win por e-mail (ajuda@ticketswin.com.br), WhatsApp (+55 11 92748-8081) ou pelo formulário. Respondemos em até 1 dia útil.";

export const metadata: Metadata = {
  title: "Fale com a gente",
  description: DESCRIPTION,
  alternates: { canonical: "/contato" },
  openGraph: { title: "Fale com a gente · Tickets Win", description: DESCRIPTION },
};

type Props = { searchParams: Promise<{ assunto?: string | string[]; artigo?: string | string[]; pedido?: string | string[] }> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ContatoPage({ searchParams }: Props) {
  const [sp, user] = await Promise.all([searchParams, getHeaderUser()]);
  const assunto = one(sp.assunto);
  const fromArticle = articleBySlug(one(sp.artigo).slice(0, 80));
  const defaults = {
    name: user?.name ?? "",
    email: user?.email ?? "",
    subject: isSubject(assunto) ? assunto : ("" as const),
    order: one(sp.pedido).replace(/[^\dA-Za-z-]/g, "").slice(0, 24),
    article: fromArticle?.slug ?? "",
  };

  return (
    <InstShell activePath="/contato">
      <div className="pg-help">
        <nav className="hp-crumb" aria-label="Você está em">
          <ol>
            <li><Link href="/ajuda">Central de ajuda</Link></li>
            <li aria-hidden="true"><IcChevron size={12} /></li>
            <li><span aria-current="page">Fale com a gente</span></li>
          </ol>
        </nav>

        <section className="hp-ct-hero" aria-labelledby="ct-t">
          <span className="eyebrow"><span className="dot" aria-hidden="true" />Suporte Tickets Win</span>
          <h1 className="hp-h1" id="ct-t">Fale com a gente</h1>
          <p className="hp-lead">Gente de verdade do outro lado. Respondemos em até 1 dia útil, por e-mail, WhatsApp ou pelo formulário.</p>
        </section>

        <section className="hp-ct-pre" aria-labelledby="ct-pre-t">
          <div className="hp-ct-pre-i">
            <h2 id="ct-pre-t">Antes de escrever, procure na central</h2>
            <p>A maioria das dúvidas sobre pagamento, reembolso, transferência e conta já tem resposta, e você não precisa esperar.</p>
          </div>
          <HelpSearch docs={searchIndex()} variant="inline" />
        </section>

        <div className="hp-ct-grid">
          <section className="hp-ct-main" aria-labelledby="ct-form-t">
            <h2 className="hp-ct-h" id="ct-form-t">Envie uma mensagem</h2>
            <p className="hp-ct-s">
              {fromArticle
                ? <>Você veio do artigo <Link href={`/ajuda/${fromArticle.slug}`}>{fromArticle.title}</Link>. Conte o que faltou.</>
                : "Quanto mais detalhes, mais rápido a gente resolve."}
            </p>
            <ContactForm human={turnstileSiteKey()} defaults={defaults} />
          </section>

          <aside className="hp-ct-side" aria-label="Outros canais">
            <a className="hp-ch" href={`mailto:${HELP_EMAIL}`}>
              <span className="hp-ic"><IcMail size={22} /></span>
              <span className="hp-ch-i">
                <small>E-mail</small>
                <b>{HELP_EMAIL}</b>
                <span>Para qualquer assunto. Mande o número do pedido.</span>
              </span>
              <IcArrow />
            </a>
            <a className="hp-ch wa" href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
              <span className="hp-ic"><IcWhatsApp size={22} /></span>
              <span className="hp-ch-i">
                <small>WhatsApp</small>
                <b>{WHATSAPP_DISPLAY}</b>
                <span>Abre a conversa com uma mensagem pronta.</span>
              </span>
              <IcArrow />
            </a>
            <div className="hp-ct-tips">
              <span className="hp-ct-tips-h"><IcClock size={18} />Resposta em até 1 dia útil</span>
              <b>Para agilizar, tenha em mãos:</b>
              <ul>
                <li>o número do pedido (no e-mail da compra e em <Link href="/conta/compras">Minha conta, Compras</Link>);</li>
                <li>o e-mail usado na compra;</li>
                <li>o comprovante, se o assunto for pagamento.</li>
              </ul>
              <p>Nunca pedimos sua senha, o código de verificação ou os dados completos do cartão.</p>
            </div>
            <div className="hp-ct-prod">
              <b>Dúvida sobre o evento em si?</b>
              <p>Horário, atrações, acessibilidade do local e lista free são com o produtor. Use <b>Falar com o produtor</b> na página do evento.</p>
            </div>
          </aside>
        </div>
      </div>
    </InstShell>
  );
}
