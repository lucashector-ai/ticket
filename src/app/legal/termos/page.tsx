import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <span className="in-upd">Última atualização: 1º de outubro de 2026</span>

      <p>Estes Termos regulam o uso do site e do aplicativo Tickets Win, operados pela <strong>Tickets Win Tecnologia Ltda.</strong>, CNPJ 00.000.000/0001-00, com sede em São Paulo – SP. Ao criar uma conta ou comprar um ingresso, você concorda com eles. Leia com atenção.</p>

      <h2 id="servico">1. O que o Tickets Win faz</h2>
      <p>O Tickets Win é uma plataforma que conecta produtores de eventos a pessoas interessadas em participar deles. Nós intermediamos a venda de ingressos, emitimos o QR Code de acesso e processamos os pagamentos. O evento em si (data, local, atrações, lotação e política de entrada) é de responsabilidade do produtor, identificado na página de cada evento.</p>

      <h2 id="conta">2. Sua conta</h2>
      <ul>
        <li>Você precisa ter pelo menos 18 anos, ou ser representado por um responsável, para criar uma conta.</li>
        <li>Os dados informados (nome, e-mail e, quando solicitado, CPF) devem ser verdadeiros e atuais. Eles aparecem no ingresso e podem ser conferidos na entrada.</li>
        <li>A senha é pessoal. Avise-nos imediatamente em ajuda@ticketswin.com.br se suspeitar de uso indevido.</li>
      </ul>

      <h2 id="compras">3. Compras, taxas e pagamentos</h2>
      <p>O preço exibido no checkout já inclui a taxa de serviço do Tickets Win, destacada antes da confirmação. Aceitamos Pix e cartão de crédito. A compra é confirmada só depois da aprovação do pagamento; até lá, o ingresso fica reservado por 10 minutos.</p>
      <p>Cada ingresso é nominal e vale para uma única entrada. O produtor pode limitar a quantidade por CPF e exigir documento na portaria.</p>

      <h2 id="reembolso">4. Cancelamentos e reembolsos</h2>
      <p>Você pode desistir da compra em até 7 dias após o pagamento, desde que faltem mais de 48 horas para o evento. Em caso de cancelamento do evento, o reembolso é integral e automático. Em adiamentos, o ingresso vale para a nova data, com direito a reembolso em até 7 dias após o anúncio. Detalhes na <Link href="/ajuda#reembolsos">Central de ajuda</Link>.</p>

      <h2 id="conduta">5. Uso aceitável</h2>
      <p>É proibido revender ingressos acima do valor de face, usar robôs ou automações para comprar, reproduzir QR Codes, publicar conteúdo ilegal ou ofensivo e tentar burlar limites por CPF. Contas que violarem estas regras podem ser suspensas e os ingressos, cancelados sem reembolso.</p>

      <h2 id="responsabilidade">6. Limites de responsabilidade</h2>
      <p>O Tickets Win não responde por alterações feitas pelo produtor (atrações, horários, local), por recusa de entrada em razão do descumprimento da política do evento, nem por danos indiretos. Nossa responsabilidade, quando houver, fica limitada ao valor pago pelos ingressos.</p>

      <h2 id="alteracoes">7. Alterações e contato</h2>
      <p>Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas por e-mail com pelo menos 15 dias de antecedência. Dúvidas: <a href="mailto:legal@ticketswin.com.br">legal@ticketswin.com.br</a>. Fica eleito o foro da comarca de São Paulo – SP.</p>
    </>
  );
}
