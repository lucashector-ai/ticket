import type { Metadata } from "next";
import Link from "next/link";
import { InstShell } from "@/components/inst-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Para produtores",
  description: "Publique seu evento na Onde, venda ingressos sem complicação e acompanhe tudo em tempo real.",
};

const MAILTO = "mailto:produtores@onde.app?subject=Quero%20criar%20um%20evento%20na%20Onde";

const BENEFITS = [
  {
    title: "Publique em minutos",
    text: "Cadastre data, lotes e capacidade, suba a arte e pronto: sua página fica no ar com link próprio e preview para redes sociais.",
    icon: <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />,
  },
  {
    title: "Taxas transparentes",
    text: "Taxa fixa por ingresso vendido, sem mensalidade e sem surpresas. Evento gratuito não paga nada.",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5h3.75" /></>,
  },
  {
    title: "Check-in sem fila",
    text: "QR Code único por ingresso, leitor no celular da equipe e contagem de entradas ao vivo, mesmo com internet instável.",
    icon: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" /></>,
  },
  {
    title: "Repasse rápido",
    text: "Receba o valor das vendas em até 2 dias úteis após o evento, com relatório completo por lote, cupom e canal.",
    icon: <><path d="M4 7h16v10H4z" /><path d="M4 11h16" /><circle cx="12" cy="14.5" r="1.3" /></>,
  },
];

const STEPS = [
  { n: "01", t: "Crie sua conta de produtor", s: "Mesma conta que você usa para comprar. Só precisamos dos dados de recebimento." },
  { n: "02", t: "Monte a página do evento", s: "Lotes, meia-entrada, cupons e limite por CPF configurados em poucos cliques." },
  { n: "03", t: "Divulgue e acompanhe", s: "Painel com vendas em tempo real, lista de participantes e exportação para a portaria." },
];

export default function ProdutoresPage() {
  return (
    <InstShell
      activePath="/produtores"
      eyebrow="Para produtores"
      title="Seu evento no lugar onde as pessoas já estão procurando."
      lead="A Onde reúne quem produz e quem quer sair de casa. Publique seu evento, venda ingressos e faça o check-in com uma ferramenta só."
      actions={
        <>
          <Link className="btn-p" href="/criar-evento">
            Criar evento
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <a className="btn-g" href={MAILTO}>Falar com a Onde</a>
        </>
      }
    >
      <section className="in-sec" aria-labelledby="beneficios">
        <h2 className="in-h2" id="beneficios"><small>Por que a Onde</small>Tudo que um evento precisa, sem a parte chata.</h2>
        <div className="in-grid">
          {BENEFITS.map((b) => (
            <article className="in-card" key={b.title}>
              <span className="in-ic" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{b.icon}</svg>
              </span>
              <b>{b.title}</b>
              <p>{b.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="in-sec" aria-labelledby="como-funciona">
        <h2 className="in-h2" id="como-funciona"><small>Como funciona</small>Do cadastro à portaria em três passos.</h2>
        <div className="in-grid c3">
          {STEPS.map((s) => (
            <article className="in-card" key={s.n}>
              <span className="num" aria-hidden="true">{s.n}</span>
              <b>{s.t}</b>
              <p>{s.s}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="in-cta" aria-labelledby="cta">
        <div>
          <h2 id="cta">Vamos colocar seu próximo evento no mapa?</h2>
          <p>Crie o evento em poucos minutos: formato, datas, setores, ingressos e cupons. Dúvidas? A gente responde em até um dia útil.</p>
        </div>
        <div className="in-acts">
          <Link className="btn-p" href="/criar-evento">Criar evento</Link>
          <a className="btn-g" href={MAILTO}>Falar com a Onde</a>
        </div>
      </section>
    </InstShell>
  );
}
