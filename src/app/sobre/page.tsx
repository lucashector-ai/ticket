import type { Metadata } from "next";
import Link from "next/link";
import { InstShell } from "@/components/inst-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sobre o Tickets Win",
  description: "O Tickets Win nasceu em São Paulo para tornar simples descobrir e viver os melhores eventos da sua cidade.",
};

const VALUES = [
  { t: "Gente antes de tudo", s: "Cada decisão de produto começa na pergunta: isso deixa a noite de alguém melhor?" },
  { t: "Transparência radical", s: "Preço final já na primeira tela, taxa explicada e sem letra miúda na hora de pedir reembolso." },
  { t: "Cidade de verdade", s: "Priorizamos a cena local: do baile de quebrada ao festival, todo evento tem o mesmo espaço." },
];

const JOBS = [
  { t: "Engenheira(o) de software pleno", s: "Produto · São Paulo ou remoto · CLT" },
  { t: "Designer de produto", s: "Design · São Paulo (híbrido) · CLT" },
  { t: "Analista de sucesso do produtor", s: "Operações · Remoto · CLT" },
];

export default function SobrePage() {
  return (
    <InstShell
      activePath="/sobre"
      eyebrow="Sobre o Tickets Win"
      title="A gente acredita que a melhor parte da cidade acontece à noite."
      lead="O Tickets Win é uma plataforma de ingressos feita em São Paulo. Começamos em 2024 cansados de descobrir o show bom só depois que ele acabou — e de pagar taxa escondida quando descobríamos a tempo."
    >
      <section className="in-sec prose" aria-labelledby="historia">
        <h2 className="in-h2" id="historia"><small>Nossa história</small>De um grupo de amigos a 300 mil pessoas por mês</h2>
        <p>Tudo começou com uma planilha compartilhada de festas e um bot que mandava os destaques da semana no grupo. Em 2024 viramos app, em 2025 passamos a vender ingressos e hoje o Tickets Win conecta mais de 1.200 produtores a quem quer sair de casa em 14 cidades brasileiras.</p>
        <p>Somos um time de 28 pessoas, metade engenharia e produto, metade operações e relacionamento com produtores. Ainda somos pequenos de propósito: preferimos fazer poucas coisas muito bem feitas.</p>
      </section>

      <section className="in-sec" aria-labelledby="valores">
        <h2 className="in-h2" id="valores"><small>No que acreditamos</small>Três coisas que não negociamos</h2>
        <div className="in-grid c3">
          {VALUES.map((v, i) => (
            <article className="in-card" key={v.t}>
              <span className="num" aria-hidden="true">0{i + 1}</span>
              <b>{v.t}</b>
              <p>{v.s}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="in-sec" id="carreiras" aria-labelledby="carreiras-t">
        <h2 className="in-h2" id="carreiras-t"><small>Carreiras</small>Vem construir o Tickets Win com a gente</h2>
        <div className="prose">
          <p>Trabalhamos em modelo híbrido com escritório na Vila Madalena, em São Paulo. Oferecemos salário compatível com o mercado, plano de saúde, vale-cultura e, claro, ingressos para os eventos da plataforma. Processos seletivos levam no máximo três semanas e você recebe retorno em todas as etapas.</p>
        </div>
        <div style={{ maxWidth: 760, marginTop: 24 }}>
          {JOBS.map((j) => (
            <div className="in-job" key={j.t}>
              <div>
                <b>{j.t}</b>
                <span>{j.s}</span>
              </div>
              <a className="btn-g" href={`mailto:vagas@onde.app?subject=${encodeURIComponent(j.t)}`}>Candidatar-se</a>
            </div>
          ))}
        </div>
      </section>

      <section className="in-sec" id="imprensa" aria-labelledby="imprensa-t">
        <h2 className="in-h2" id="imprensa-t"><small>Imprensa</small>Falando sobre o Tickets Win</h2>
        <div className="in-press">
          <article className="in-card">
            <b>Contato para jornalistas</b>
            <p>Entrevistas, dados sobre o mercado de eventos e pautas sobre a cena cultural das cidades em que atuamos: <a href="mailto:imprensa@onde.app">imprensa@onde.app</a>. Respondemos no mesmo dia útil.</p>
          </article>
          <article className="in-card">
            <b>Kit de marca</b>
            <p>Logo em SVG e PNG, paleta de cores, fotos do time e do escritório, e um resumo institucional de uma página. Peça pelo e-mail de imprensa e enviamos o link.</p>
          </article>
        </div>
      </section>

      <section className="in-cta" aria-labelledby="cta">
        <div>
          <h2 id="cta">Produz eventos? O Tickets Win foi feito para você também.</h2>
          <p>Publique seu evento, venda ingressos e faça o check-in com uma ferramenta só, com taxa transparente e repasse rápido.</p>
        </div>
        <div className="in-acts">
          <Link className="btn-p" href="/produtores">Para produtores</Link>
          <Link className="btn-g" href="/explorar">Explorar eventos</Link>
        </div>
      </section>
    </InstShell>
  );
}
