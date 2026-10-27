import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <span className="in-upd">Última atualização: 1º de outubro de 2026</span>

      <p>Esta política explica quais dados pessoais a <strong>Onde Tecnologia Ltda.</strong> coleta, por que coleta e como você pode exercer seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h2 id="dados">1. Quais dados coletamos</h2>
      <table>
        <thead><tr><th>Dado</th><th>Quando</th><th>Para quê</th></tr></thead>
        <tbody>
          <tr><td>Nome, e-mail e senha</td><td>Ao criar a conta</td><td>Identificar você e emitir ingressos nominais</td></tr>
          <tr><td>CPF</td><td>No checkout, quando o produtor exige</td><td>Limitar compras por pessoa e cumprir a lei da meia-entrada</td></tr>
          <tr><td>Dados de pagamento</td><td>No checkout</td><td>Processados pelo nosso parceiro de pagamentos; não armazenamos o número do cartão</td></tr>
          <tr><td>Cidade e eventos favoritos</td><td>Durante o uso</td><td>Personalizar a home e as recomendações</td></tr>
          <tr><td>Dados de navegação</td><td>Durante o uso</td><td>Segurança, métricas e melhoria do produto (veja <Link href="/legal/cookies">Cookies</Link>)</td></tr>
        </tbody>
      </table>

      <h2 id="compartilhamento">2. Com quem compartilhamos</h2>
      <ul>
        <li><strong>Produtores:</strong> recebem nome e e-mail dos participantes do próprio evento, para a lista de entrada e comunicados sobre o evento.</li>
        <li><strong>Processadores de pagamento e antifraude:</strong> para aprovar a compra e evitar fraudes.</li>
        <li><strong>Provedores de infraestrutura</strong> (hospedagem, e-mail transacional, autenticação): atuam como operadores, sob contrato.</li>
        <li><strong>Autoridades</strong>, quando exigido por lei ou ordem judicial.</li>
      </ul>
      <p>Não vendemos dados pessoais nem os usamos para publicidade de terceiros.</p>

      <h2 id="retencao">3. Por quanto tempo guardamos</h2>
      <p>Dados da conta ficam armazenados enquanto ela existir. Registros de compra são mantidos por 5 anos após o evento, por obrigação fiscal e para defesa em processos. Dados de navegação são agregados ou apagados em até 12 meses.</p>

      <h2 id="direitos">4. Seus direitos</h2>
      <p>Você pode, a qualquer momento, confirmar que tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, a anonimização ou a exclusão, e revogar consentimentos. Para isso, escreva para <a href="mailto:privacidade@onde.app">privacidade@onde.app</a>. Respondemos em até 15 dias.</p>

      <h2 id="seguranca">5. Segurança</h2>
      <p>Usamos criptografia em trânsito e em repouso, autenticação com senha protegida por hash e acesso restrito aos dados por função. Em caso de incidente com risco relevante, avisaremos você e a ANPD conforme a lei.</p>

      <h2 id="encarregado">6. Encarregado (DPO)</h2>
      <p>Nosso encarregado pelo tratamento de dados pode ser contatado em <a href="mailto:dpo@onde.app">dpo@onde.app</a> ou no endereço da sede, em São Paulo – SP.</p>
    </>
  );
}
