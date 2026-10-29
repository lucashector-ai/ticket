import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstShell } from "@/components/inst-shell";
import { HelpFeedback } from "@/components/ajuda/feedback";
import { CatIcon, IcArrow, IcChevron, IcMail } from "@/components/ajuda/icons";
import { ArticleBody } from "@/components/ajuda/rich";
import { articleBySlug, articlesIn, categoryBySlug, relatedTo } from "@/lib/help/articles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** Assunto do formulário de contato que combina com cada categoria. */
const SUBJECT: Record<string, string> = {
  comprar: "pagamento", pagamento: "pagamento", "meus-ingressos": "ingressos", transferencia: "transferencia",
  grupo: "pagamento", "meia-entrada": "ingressos", reembolsos: "reembolso", conta: "conta", acessibilidade: "outro", produtores: "produtor",
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = articleBySlug((await params).slug);
  if (!a) return { title: "Artigo não encontrado", robots: { index: false } };
  const cat = categoryBySlug(a.cat);
  return {
    title: `${a.title} · Central de ajuda`,
    description: a.summary,
    alternates: { canonical: `/ajuda/${a.slug}` },
    openGraph: { title: a.title, description: a.summary, type: "article", url: `/ajuda/${a.slug}`, section: cat?.title },
  };
}

export default async function AjudaArtigoPage({ params }: Params) {
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const cat = categoryBySlug(a.cat)!;
  const siblings = articlesIn(a.cat);
  const related = relatedTo(a, 3);
  const subject = SUBJECT[a.cat] ?? "outro";

  return (
    <InstShell activePath="/ajuda">
      <div className="pg-help">
        <nav className="hp-crumb" aria-label="Você está em">
          <ol>
            <li><Link href="/ajuda">Central de ajuda</Link></li>
            <li aria-hidden="true"><IcChevron size={12} /></li>
            <li><Link href={`/ajuda#${cat.slug}`}>{cat.title}</Link></li>
          </ol>
        </nav>

        <div className="hp-doc">
          <article className="hp-art" aria-labelledby="art-t">
            <span className="hp-art-cat"><CatIcon name={cat.icon} size={16} />{cat.title}</span>
            <h1 id="art-t">{a.title}</h1>
            <p className="hp-art-lead">{a.summary}</p>
            <div className="hp-prose">
              <ArticleBody blocks={a.body} />
            </div>
            <HelpFeedback slug={a.slug} subject={subject} />
          </article>

          <aside className="hp-side" aria-label="Mais sobre este assunto">
            <div className="hp-side-box">
              <small>Nesta categoria</small>
              <ul>
                {siblings.map((s) => (
                  <li key={s.slug}>
                    {s.slug === a.slug
                      ? <span className="on" aria-current="page">{s.title}</span>
                      : <Link href={`/ajuda/${s.slug}`}>{s.title}</Link>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hp-side-help">
              <span className="hp-ic sm"><IcMail size={20} /></span>
              <b>Ainda precisa de ajuda?</b>
              <p>Conte o que aconteceu e o número do pedido. Respondemos em até 1 dia útil.</p>
              <Link className="btn-p sm" href={`/contato?assunto=${subject}&artigo=${a.slug}`}>Falar com o suporte</Link>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="hp-sec hp-rel" aria-labelledby="rel-t">
            <h2 className="hp-h2" id="rel-t"><small>Continue lendo</small>Artigos relacionados</h2>
            <ul className="hp-rel-g">
              {related.map((r) => {
                const rc = categoryBySlug(r.cat)!;
                return (
                  <li key={r.slug}>
                    <Link className="hp-rel-c" href={`/ajuda/${r.slug}`}>
                      <span className="hp-res-c">{rc.title}</span>
                      <b>{r.title}</b>
                      <span className="hp-res-s">{r.summary}</span>
                      <span className="hp-rel-go">Ler artigo <IcArrow size={14} /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="in-cta" aria-labelledby="art-cta">
          <div>
            <h2 id="art-cta">Ainda precisa de ajuda?</h2>
            <p>Nosso time responde por e-mail, WhatsApp ou pelo formulário de contato, em até 1 dia útil.</p>
          </div>
          <div className="in-acts">
            <Link className="btn-p" href={`/contato?assunto=${subject}&artigo=${a.slug}`}>Falar com o suporte</Link>
            <Link className="btn-g" href="/ajuda">Voltar à central</Link>
          </div>
        </section>
      </div>
    </InstShell>
  );
}
