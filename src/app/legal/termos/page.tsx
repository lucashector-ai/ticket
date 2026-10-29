import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <span className="in-upd">Última atualização: 1º de outubro de 2026</span>

      <p>Estes Termos regulam o uso do site e do aplicativo Tickets Win, operados pela <strong>Tickets Win Serviços de Reservas LTDA</strong> (CNPJ em registro), com sede em São Paulo – SP. Ao criar uma conta ou comprar um ingresso, você concorda com eles. Leia com atenção.</p>

      <h2 id="servico">1. O que a Tickets Win faz</h2>
      <p>A Tickets Win é uma plataforma que conecta produtores de eventos a pessoas interessadas em participar deles. Nós intermediamos a venda de ingressos, emitimos o QR code de acesso e processamos os pagamentos. O evento em si (data, local, atrações, lotação e política de entrada) é de responsabilidade do produtor, identificado na página de cada evento.</p>

      <h2 id="conta">2. Sua conta</h2>
      <ul>
        <li>Você precisa ter pelo menos 18 anos, ou ser representado por um responsável, para criar uma conta.</li>
        <li>Os dados informados (nome, e-mail e CPF) devem ser verdadeiros e atuais. O nome do titular aparece no ingresso e pode ser conferido na entrada.</li>
        <li>A senha é pessoal. Avise-nos imediatamente em ajuda@ticketswin.com.br se suspeitar de uso indevido.</li>
      </ul>

      <h2 id="compras">3. Compras, taxas e pagamentos</h2>
      <p>O total exibido no checkout já inclui a taxa de serviço da Tickets Win (7,99% por ingresso), mostrada antes do pagamento. Aceitamos Pix e cartão de crédito em até 6x (até 3x sem juros), pagos dentro do checkout da Tickets Win. A compra é confirmada só depois da aprovação do pagamento; até lá, você tem 15 minutos para concluir o pagamento.</p>
      <p>Cada ingresso é nominal e vale para uma única entrada. O produtor pode limitar a quantidade de ingressos por pessoa (conferida pela conta e pelo CPF), e pedir documento na entrada fica a critério do local.</p>

      <h2 id="reembolso">4. Cancelamentos e reembolsos</h2>
      <p>Você pode desistir da compra em até 7 dias após o pagamento, desde que faltem mais de 48 horas para o evento, com reembolso integral, inclusive da taxa de serviço. Fora desse prazo, vale a política de cancelamento de cada evento, definida pelo produtor e mostrada na página do evento e no ingresso; nesses cancelamentos feitos pelo comprador, a taxa de serviço não é devolvida. Em caso de cancelamento do evento, o reembolso é integral (com a taxa de serviço) e automático. Em adiamentos, o ingresso vale para a nova data, com direito a reembolso em até 7 dias após o anúncio. O valor volta pelo mesmo meio de pagamento, e o prazo para aparecer depende do banco ou da operadora do cartão. Detalhes na <Link href="/ajuda#reembolsos">Central de ajuda</Link>.</p>

      <h2 id="conduta">5. Uso aceitável</h2>
      <p>É proibido revender ingressos acima do valor de face, usar robôs ou automações para comprar, reproduzir QR codes, publicar conteúdo ilegal ou ofensivo e tentar burlar limites por pessoa (por exemplo, com várias contas ou CPFs de terceiros). Contas que violarem estas regras podem ser suspensas e os ingressos, cancelados sem reembolso.</p>

      <h2 id="responsabilidade">6. Limites de responsabilidade</h2>
      <p>A Tickets Win não responde por alterações feitas pelo produtor (atrações, horários, local), por recusa de entrada em razão do descumprimento da política do evento, nem por danos indiretos. Nossa responsabilidade, quando houver, fica limitada ao valor pago pelos ingressos.</p>

      <h2 id="alteracoes">7. Alterações e contato</h2>
      <p>Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas por e-mail com pelo menos 15 dias de antecedência. Dúvidas: <a href="mailto:legal@ticketswin.com.br">legal@ticketswin.com.br</a>. Fica eleito o foro da comarca de São Paulo – SP.</p>
    </>
  );
}
