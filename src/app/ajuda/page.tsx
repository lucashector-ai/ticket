import type { Metadata } from "next";
import Link from "next/link";
import { InstShell } from "@/components/inst-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Central de ajuda",
  description: "Reembolsos, meia-entrada, transferência de ingressos e as dúvidas mais comuns sobre o Tickets Win.",
};

const TOPICS = [
  { href: "#reembolsos", t: "Reembolsos", s: "Prazos, como pedir e quando o valor volta." },
  { href: "#meia-entrada", t: "Meia-entrada", s: "Quem tem direito e o que apresentar na portaria." },
  { href: "#transferencia", t: "Transferir ingresso", s: "Mande o ingresso para outra pessoa com segurança." },
  { href: "#faq", t: "Perguntas frequentes", s: "Pagamento, QR Code, eventos cancelados e mais." },
];

const FAQ = [
  { q: "Onde fica o meu ingresso depois da compra?", a: "Em Meus ingressos, na sua conta. Você também recebe o QR Code por e-mail. Não precisa imprimir: basta mostrar no celular na entrada." },
  { q: "Quais formas de pagamento vocês aceitam?", a: "Pix (aprovação na hora) e cartão de crédito em até 3x sem juros. O parcelamento depende do produtor e aparece no checkout." },
  { q: "O evento foi cancelado ou adiado. E agora?", a: "Se for cancelado, o reembolso é automático e integral, inclusive a taxa de serviço. Se for adiado, seu ingresso continua válido para a nova data; se não puder ir, você pode pedir o reembolso em até 7 dias após o anúncio." },
  { q: "Meu QR Code não está carregando.", a: "Abra o ingresso pela sua conta com a internet ligada ao menos uma vez: ele fica salvo para funcionar offline. Se ainda assim não aparecer, procure a equipe do Tickets Win na portaria com um documento com foto." },
  { q: "Posso comprar para outra pessoa?", a: "Pode. No checkout você informa o nome de quem vai usar cada ingresso. Depois, é só transferir pela sua conta (veja a seção Transferir ingresso)." },
  { q: "Como falo com o produtor do evento?", a: "Na página do evento há o contato do organizador. Para dúvidas sobre pagamento, reembolso e conta, fale com a gente em ajuda@onde.app." },
];

export default function AjudaPage() {
  return (
    <InstShell
      activePath="/ajuda"
      eyebrow="Central de ajuda"
      title="Como podemos ajudar?"
      lead="Respostas rápidas para as dúvidas mais comuns. Se não encontrar o que procura, escreva para ajuda@onde.app: respondemos em até um dia útil."
    >
      <nav className="in-grid" aria-label="Tópicos de ajuda">
        {TOPICS.map((t) => (
          <Link className="in-card" href={t.href} key={t.href}>
            <b>{t.t}</b>
            <p>{t.s}</p>
          </Link>
        ))}
      </nav>

      <section className="in-sec prose" id="reembolsos" aria-labelledby="reembolsos-t">
        <h2 className="in-h2" id="reembolsos-t"><small>Reembolsos</small>Como pedir o reembolso de um ingresso</h2>
        <p>Você pode pedir o reembolso de qualquer compra em até <strong>7 dias</strong> após o pagamento, desde que falte mais de <strong>48 horas</strong> para o início do evento (Código de Defesa do Consumidor, art. 49). O pedido é feito em <Link href="/meus-ingressos">Meus ingressos</Link>, no botão &ldquo;Pedir reembolso&rdquo; do ingresso.</p>
        <ul>
          <li><strong>Pix:</strong> o valor volta para a mesma chave em até 2 dias úteis.</li>
          <li><strong>Cartão de crédito:</strong> o estorno aparece na fatura em até 2 faturas, conforme o banco emissor.</li>
          <li><strong>Evento cancelado:</strong> reembolso automático e integral, sem precisar pedir.</li>
        </ul>
        <p>Fora do prazo de 7 dias, o reembolso depende da política do produtor, informada na página do evento. Taxas de serviço só são devolvidas em cancelamentos.</p>
      </section>

      <section className="in-sec prose" id="meia-entrada" aria-labelledby="meia-t">
        <h2 className="in-h2" id="meia-t"><small>Meia-entrada</small>Quem tem direito e como comprovar</h2>
        <p>Conforme a Lei 12.933/2013, têm direito à meia-entrada estudantes, pessoas com deficiência (e acompanhante, quando necessário), jovens de 15 a 29 anos de baixa renda inscritos no CadÚnico e pessoas com 60 anos ou mais. Em cada evento, 40% dos ingressos são reservados para a meia.</p>
        <p>Na entrada, apresente o documento junto com o ingresso:</p>
        <ul>
          <li>Carteira de estudante válida (CIE, emitida pela UNE/UBES/ANPG ou pela instituição) ou a Carteira de Identificação Estudantil digital.</li>
          <li>Documento oficial com foto que comprove a idade (idosos) ou a identidade (jovens de baixa renda, com a ID Jovem).</li>
          <li>Laudo ou cartão de benefício para pessoas com deficiência.</li>
        </ul>
        <p>Sem a comprovação, a portaria pode cobrar a diferença para a inteira ou recusar a entrada. Compre a meia só se tiver o documento em mãos.</p>
      </section>

      <section className="in-sec prose" id="transferencia" aria-labelledby="transf-t">
        <h2 className="in-h2" id="transf-t"><small>Transferência</small>Como transferir um ingresso para outra pessoa</h2>
        <ol>
          <li>Abra o ingresso em <Link href="/meus-ingressos">Meus ingressos</Link> e toque em &ldquo;Transferir&rdquo;.</li>
          <li>Informe o e-mail de quem vai receber. Se a pessoa ainda não tiver conta no Tickets Win, ela cria uma com esse e-mail.</li>
          <li>Confirme. O QR Code antigo é invalidado na hora e um novo é gerado para o destinatário.</li>
        </ol>
        <p>A transferência é gratuita, pode ser feita até o início do evento e não pode ser desfeita, então confira o e-mail antes de confirmar. Ingressos de meia-entrada só podem ser transferidos para quem também tem direito ao benefício.</p>
      </section>

      <section className="in-sec" id="faq" aria-labelledby="faq-t">
        <h2 className="in-h2" id="faq-t"><small>FAQ</small>Perguntas frequentes</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="in-cta" aria-labelledby="contato">
        <div>
          <h2 id="contato">Ainda precisa de ajuda?</h2>
          <p>Escreva para a gente contando o evento e o número do pedido. Respondemos em até um dia útil, todos os dias.</p>
        </div>
        <div className="in-acts">
          <a className="btn-p" href="mailto:ajuda@onde.app">Falar com o suporte</a>
          <Link className="btn-g" href="/meus-ingressos">Meus ingressos</Link>
        </div>
      </section>
    </InstShell>
  );
}
