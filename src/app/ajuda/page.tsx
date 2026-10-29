import type { Metadata } from "next";
import Link from "next/link";
import { InstShell } from "@/components/inst-shell";
import { HelpSearch } from "@/components/ajuda/help-search";
import { CatIcon, IcArrow, IcChevron } from "@/components/ajuda/icons";
import { ARTICLES, articleBySlug, articlesIn, CATEGORIES, POPULAR, searchIndex } from "@/lib/help/articles";

export const dynamic = "force-dynamic";
const DESCRIPTION = "Tire suas dúvidas sobre a Tickets Win: compra de ingressos, Pix e cartão, taxa de serviço, QR code, transferência, revenda oficial, meia-entrada, reembolso, segurança da conta e ferramentas para produtores.";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q;
  return {
    title: "Central de ajuda",
    description: DESCRIPTION,
    alternates: { canonical: "/ajuda" },
    openGraph: { title: "Central de ajuda · Tickets Win", description: DESCRIPTION, url: "/ajuda" },
    // páginas de busca (?q=) não entram no índice: a canônica é a central
    ...(typeof q === "string" && q.trim() ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function AjudaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const fans = CATEGORIES.filter((c) => c.audience === "fas");
  const prod = CATEGORIES.filter((c) => c.audience === "produtores");
  const popular = POPULAR.map(articleBySlug).filter((a) => a !== null);

  return (
    <InstShell activePath="/ajuda">
      <div className="pg-help">
        <HelpSearch docs={searchIndex()} initialQ={q}>
          <section className="hp-sec" aria-labelledby="pop-t">
            <h2 className="hp-h2" id="pop-t"><small>Mais procurados</small>Respostas rápidas</h2>
            <ul className="hp-pop">
              {popular.map((a) => (
                <li key={a.slug}>
                  <Link href={`/ajuda/${a.slug}`}>
                    <span>{a.title}</span>
                    <IcChevron />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="hp-sec" aria-labelledby="cat-t">
            <h2 className="hp-h2" id="cat-t"><small>Para quem compra</small>Escolha um assunto</h2>
            <nav className="hp-cats" aria-label="Assuntos para quem compra">
              {fans.map((c) => (
                <a className="hp-cat" href={`#${c.slug}`} key={c.slug}>
                  <span className="hp-ic"><CatIcon name={c.icon} /></span>
                  <b>{c.title}</b>
                  <p>{c.desc}</p>
                  <span className="hp-cat-n">{articlesIn(c.slug).length} artigos</span>
                </a>
              ))}
            </nav>
            {prod.map((c) => (
              <a className="hp-prod" href={`#${c.slug}`} key={c.slug}>
                <span className="hp-ic"><CatIcon name={c.icon} /></span>
                <div>
                  <small>Para produtores</small>
                  <b>Produz eventos? Tem uma área só sua.</b>
                  <p>{c.desc}</p>
                </div>
                <span className="hp-prod-go">{articlesIn(c.slug).length} artigos <IcArrow /></span>
              </a>
            ))}
          </section>

          <div className="hp-topics">
            {CATEGORIES.map((c) => {
              const list = articlesIn(c.slug);
              return (
                <section className="hp-topic" id={c.slug} key={c.slug} aria-labelledby={`${c.slug}-t`}>
                  <header className="hp-topic-h">
                    <span className="hp-ic sm"><CatIcon name={c.icon} size={20} /></span>
                    <div>
                      <h2 id={`${c.slug}-t`}>{c.title}</h2>
                      <p>{c.desc}</p>
                    </div>
                  </header>
                  <ul className="hp-alist">
                    {list.map((a) => (
                      <li key={a.slug}>
                        <Link href={`/ajuda/${a.slug}`}>
                          <b>{a.title}</b>
                          <span>{a.summary}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="hp-count">{ARTICLES.length} artigos na central, escritos pelo time da Tickets Win.</p>
        </HelpSearch>

        <section className="in-cta" aria-labelledby="ajuda-cta">
          <div>
            <h2 id="ajuda-cta">Ainda precisa de ajuda?</h2>
            <p>Fale com a gente por e-mail, WhatsApp ou pelo formulário. Tenha em mãos o número do pedido: respondemos em até 1 dia útil.</p>
          </div>
          <div className="in-acts">
            <Link className="btn-p" href="/contato">Falar com o suporte</Link>
            <Link className="btn-g" href="/meus-ingressos">Meus ingressos</Link>
          </div>
        </section>
      </div>
    </InstShell>
  );
}
