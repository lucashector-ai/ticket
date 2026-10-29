import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de cookies" };

export default function CookiesPage() {
  return (
    <>
      <h1>Política de cookies</h1>
      <span className="in-upd">Última atualização: 1º de outubro de 2026</span>

      <p>Cookies são pequenos arquivos que o site salva no seu navegador. A Tickets Win usa poucos, e nenhum deles serve para publicidade de terceiros. Esta página explica cada um e como você controla isso.</p>

      <h2 id="tipos">1. Quais cookies usamos</h2>
      <table>
        <thead><tr><th>Cookie</th><th>Tipo</th><th>Duração</th><th>Finalidade</th></tr></thead>
        <tbody>
          <tr><td><code>onde.session</code></td><td>Necessário</td><td>30 dias</td><td>Manter você conectado à sua conta</td></tr>
          <tr><td><code>onde.csrf</code></td><td>Necessário</td><td>Sessão</td><td>Proteger formulários contra requisições forjadas</td></tr>
          <tr><td><code>onde.city</code></td><td>Preferência</td><td>1 ano</td><td>Lembrar a cidade escolhida na home</td></tr>
          <tr><td><code>onde.metrics</code></td><td>Estatística</td><td>6 meses</td><td>Medir uso de forma agregada e anônima (sem perfil individual)</td></tr>
        </tbody>
      </table>

      <h2 id="controle">2. Como controlar</h2>
      <p>Cookies necessários não podem ser desativados sem que o login deixe de funcionar. Os demais podem ser apagados ou bloqueados nas configurações do seu navegador (Chrome, Safari, Firefox e Edge têm a opção em &ldquo;Privacidade&rdquo;). Se bloquear o cookie de estatística, continuamos funcionando normalmente.</p>

      <h2 id="terceiros">3. Serviços de terceiros</h2>
      <p>O checkout carrega o componente do nosso processador de pagamentos, que pode gravar cookies próprios de antifraude durante a compra. O login com Google grava cookies do Google apenas quando você escolhe essa opção. Nenhum deles é usado pela Tickets Win para rastrear você fora do site.</p>

      <h2 id="mais">4. Mais informações</h2>
      <p>Como tratamos os dados coletados por esses cookies está descrito na <Link href="/legal/privacidade">Política de privacidade</Link>. Dúvidas: <a href="mailto:privacidade@ticketswin.com.br">privacidade@ticketswin.com.br</a>.</p>
    </>
  );
}
