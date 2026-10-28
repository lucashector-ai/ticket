import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Acessibilidade" };

export default function AcessibilidadePage() {
  return (
    <>
      <h1>Acessibilidade</h1>
      <span className="in-upd">Última atualização: 1º de outubro de 2026</span>

      <p>Queremos que qualquer pessoa consiga descobrir um evento e comprar o ingresso no Tickets Win, independentemente de como usa a internet. Esta página descreve o que já fazemos, o que ainda falta e como falar com a gente.</p>

      <h2 id="compromisso">1. Nosso compromisso</h2>
      <p>Seguimos as Diretrizes de Acessibilidade para Conteúdo Web (WCAG 2.2) no nível AA como meta para todo o site e aplicativo, em linha com a Lei Brasileira de Inclusão (Lei 13.146/2015). Novas telas passam por revisão de acessibilidade antes de ir ao ar.</p>

      <h2 id="recursos">2. O que já está disponível</h2>
      <ul>
        <li>Navegação completa por teclado, com foco visível em todos os elementos interativos.</li>
        <li>Compatibilidade com leitores de tela (NVDA, VoiceOver e TalkBack), com rótulos e regiões nomeadas.</li>
        <li>Contraste mínimo de 4,5:1 nos textos e botões; cores nunca são o único indicador de estado.</li>
        <li>Textos redimensionáveis até 200% sem perda de conteúdo e layout responsivo para telas pequenas.</li>
        <li>Respeito à preferência de movimento reduzido do sistema: animações são desligadas automaticamente.</li>
        <li>QR Code do ingresso com código alfanumérico alternativo para leitura na portaria.</li>
      </ul>

      <h2 id="eventos">3. Acessibilidade nos eventos</h2>
      <p>Cada página de evento tem uma seção &ldquo;Acessibilidade do local&rdquo;, preenchida pelo produtor, com informações sobre acesso para cadeira de rodas, banheiros adaptados, intérprete de Libras e área reservada. Pessoas com deficiência têm direito à meia-entrada e a um acompanhante, conforme a <Link href="/ajuda#meia-entrada">Central de ajuda</Link>.</p>

      <h2 id="limitacoes">4. Limitações conhecidas</h2>
      <ul>
        <li>Algumas artes de eventos enviadas pelos produtores podem não ter descrição textual suficiente. Estamos exigindo texto alternativo no cadastro desde setembro de 2026.</li>
        <li>O player de prévias de áudio ainda não tem transcrição.</li>
      </ul>

      <h2 id="contato">5. Encontrou uma barreira?</h2>
      <p>Conte para a gente em <a href="mailto:acessibilidade@ticketswin.com.br">acessibilidade@ticketswin.com.br</a>, descrevendo a página e a tecnologia assistiva que usa. Respondemos em até 2 dias úteis e priorizamos a correção.</p>
    </>
  );
}
