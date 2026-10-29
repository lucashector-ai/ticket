/*
 * Central de ajuda da Tickets Win: categorias e artigos (conteúdo estático).
 * Tudo aqui descreve o que a plataforma faz hoje (checkout, revenda, grupo, conta, painel...).
 * Ao mudar uma regra no código, atualize o artigo correspondente.
 *
 * Texto com marcação mínima: **negrito** e [rótulo](/caminho).
 */

import { fold, type SearchDoc } from "./search";

export type HelpIcon =
  | "ticket" | "card" | "qr" | "swap" | "group" | "half" | "refund" | "shield" | "stage" | "access";

export type HelpCategory = {
  slug: string;
  title: string;
  /** frase curta do cartão */
  desc: string;
  icon: HelpIcon;
  audience: "fas" | "produtores";
};

export type HelpBlock =
  | { t: "p"; x: string }
  | { t: "h"; x: string }
  | { t: "ul"; x: string[] }
  | { t: "ol"; x: string[] }
  | { t: "tip"; x: string }
  | { t: "warn"; x: string };

export type HelpArticle = {
  slug: string;
  cat: string;
  title: string;
  summary: string;
  body: HelpBlock[];
  /** artigos de outras categorias que ajudam (os da mesma categoria entram sozinhos) */
  related?: string[];
  /** palavras extras para a busca (sinônimos, termos que as pessoas digitam) */
  keywords?: string;
};

const p = (x: string): HelpBlock => ({ t: "p", x });
const h = (x: string): HelpBlock => ({ t: "h", x });
const ul = (...x: string[]): HelpBlock => ({ t: "ul", x });
const ol = (...x: string[]): HelpBlock => ({ t: "ol", x });
const tip = (x: string): HelpBlock => ({ t: "tip", x });
const warn = (x: string): HelpBlock => ({ t: "warn", x });

export const CATEGORIES: HelpCategory[] = [
  { slug: "comprar", title: "Comprar ingressos", desc: "Passo a passo, CPF e titulares, limites, fila virtual, pré-venda e cupons.", icon: "ticket", audience: "fas" },
  { slug: "pagamento", title: "Pagamento e taxa", desc: "Pix, cartão em até 6x e a taxa de serviço de 7,99%.", icon: "card", audience: "fas" },
  { slug: "meus-ingressos", title: "Meus ingressos e QR code", desc: "Onde ficam, como entrar no evento e carteira digital.", icon: "qr", audience: "fas" },
  { slug: "transferencia", title: "Transferir e revenda", desc: "Mande para um amigo ou venda na revenda oficial.", icon: "swap", audience: "fas" },
  { slug: "grupo", title: "Ingresso em grupo", desc: "Reserve para a galera e cada um paga a sua parte.", icon: "group", audience: "fas" },
  { slug: "meia-entrada", title: "Meia-entrada", desc: "Quem tem direito, como comprar e o que levar.", icon: "half", audience: "fas" },
  { slug: "reembolsos", title: "Cancelamento, adiamento e reembolso", desc: "Prazos, evento cancelado ou adiado e como pedir.", icon: "refund", audience: "fas" },
  { slug: "conta", title: "Conta e segurança", desc: "Ativação, duas etapas, senha, e-mail e aparelhos.", icon: "shield", audience: "fas" },
  { slug: "acessibilidade", title: "Acessibilidade", desc: "Recursos do site e direitos da pessoa com deficiência.", icon: "access", audience: "fas" },
  { slug: "produtores", title: "Para produtores", desc: "Inscrição, evento, lotes, mapa 3D, lista free, portaria, saques e marketing.", icon: "stage", audience: "produtores" },
];

export const ARTICLES: HelpArticle[] = [
  /* ============================== Comprar ingressos ============================== */
  {
    slug: "como-comprar", cat: "comprar",
    title: "Como comprar um ingresso, passo a passo",
    summary: "Do botão Comprar ao QR code no celular em quatro etapas: resumo, dados, pagamento e confirmação.",
    keywords: "comprar checkout finalizar compra passo a passo como funciona",
    body: [
      p("Comprar na Tickets Win leva poucos minutos. Você precisa de uma conta para finalizar, mas pode entrar ou criar a conta no meio do caminho, sem perder o que escolheu."),
      ol(
        "Na página do evento, escolha a data (se houver mais de uma), o setor e a quantidade de cada tipo de ingresso. Toque em **Continuar para pagamento**.",
        "**Resumo:** confira os ingressos, aplique um cupom se tiver e veja o valor com a taxa de serviço já separada.",
        "**Dados:** informe nome completo, e-mail, celular com DDD e **CPF (obrigatório)** de quem está comprando, e o nome e sobrenome de quem vai usar cada ingresso. Se alguém tiver direito à meia-entrada, marque aqui.",
        "**Pagamento:** escolha Pix ou cartão de crédito (em até 6x) e pague ali mesmo, sem sair do checkout.",
        "Pronto: o pedido aparece como confirmado, os ingressos vão para [Meus ingressos](/meus-ingressos) e você recebe um e-mail com o resumo.",
      ),
      tip("Seus dados de comprador (celular e CPF) ficam salvos no perfil e já aparecem preenchidos na próxima compra."),
      p("O checkout tem um tempo para ser concluído. Veja [quanto tempo você tem para pagar](/ajuda/tempo-de-reserva)."),
    ],
    related: ["cpf-na-compra", "formas-de-pagamento", "taxa-de-servico"],
  },
  {
    slug: "ingresso-nominal", cat: "comprar",
    title: "Por que preciso informar o nome de cada titular?",
    summary: "Todo ingresso da Tickets Win é nominal: leva o nome de quem vai usar e pode ser conferido na entrada.",
    keywords: "nominal titular nome documento outra pessoa comprar para amigo",
    body: [
      p("Cada ingresso vale para **uma pessoa e uma entrada**. Por isso, na etapa de dados, pedimos o nome e sobrenome de quem vai usar cada um. Se o ingresso é seu, é só marcar que é você."),
      p("O nome aparece no ingresso e o produtor pode pedir um documento com foto na portaria para conferir. Escreva como está no documento."),
      h("Comprei para outra pessoa"),
      p("Tudo bem: informe o nome dela como titular. Os ingressos ficam na sua conta. Se preferir que a pessoa tenha o ingresso no celular dela, [transfira pelo e-mail](/ajuda/transferir-ingresso). Na transferência, o ingresso passa a ter o nome da conta de quem recebe."),
    ],
    related: ["nome-errado-no-ingresso", "transferir-ingresso"],
  },
  {
    slug: "limite-por-pessoa", cat: "comprar",
    title: "Existe limite de ingressos por pessoa?",
    summary: "Sim. Cada evento tem um máximo por compra e cada tipo de ingresso tem um limite por pessoa, definidos pelo produtor.",
    keywords: "limite maximo quantidade quantos ingressos por cpf por pessoa por conta outra conta",
    body: [
      p("Quem define os limites é o produtor do evento. Existem dois:"),
      ul(
        "**Máximo por compra:** quantos ingressos, somando todos os tipos, cabem em um pedido.",
        "**Limite por pessoa de cada tipo:** por exemplo, até 4 ingressos de Pista Inteira por pessoa. Esse limite soma as compras já pagas **na sua conta e no seu CPF**: comprar por outra conta com o mesmo CPF não aumenta o limite.",
      ),
      p("Se passar do limite, o checkout avisa quantos você já tem e qual é o máximo. O limite é conferido de novo na confirmação do pagamento. Os limites existem para mais gente conseguir comprar e para dificultar a ação de cambistas."),
      tip("Ingressos que você recebe por transferência, compra na revenda oficial ou parte de compra em grupo não contam para o seu limite de compra."),
    ],
    related: ["cpf-na-compra"],
  },
  {
    slug: "cpf-na-compra", cat: "comprar",
    title: "Por que o CPF é obrigatório na compra?",
    summary: "O CPF identifica quem compra, ajuda a evitar fraudes e conta para o limite de ingressos por pessoa.",
    keywords: "cpf obrigatorio documento dados do comprador estrangeiro sem cpf invalido",
    body: [
      p("Na etapa **Dados** do checkout, o CPF de quem está comprando é obrigatório. Sem um CPF válido, o pedido não segue para o pagamento."),
      ul(
        "Identifica o comprador no pedido e no pagamento.",
        "Ajuda a barrar fraudes e compras em massa de cambistas.",
        "Conta para o [limite de ingressos por pessoa](/ajuda/limite-por-pessoa), junto com a sua conta.",
      ),
      p("O CPF é de **quem compra**, não de cada titular. Para os ingressos, pedimos só o nome e sobrenome de quem vai usar."),
      tip("Depois da primeira compra, o CPF fica salvo no seu perfil e já aparece preenchido. Ele é tratado conforme a [Política de privacidade](/legal/privacidade)."),
      p("O checkout diz que o CPF é inválido? Confira os 11 números. Se estiver certo e o erro continuar, [fale com a gente](/contato?assunto=pagamento)."),
    ],
    related: ["limite-por-pessoa", "como-comprar"],
  },
  {
    slug: "tempo-de-reserva", cat: "comprar",
    title: "Quanto tempo tenho para concluir a compra?",
    summary: "O checkout dá 15 minutos para preencher e pagar, inclusive no Pix. O ingresso é seu quando o pagamento é aprovado.",
    keywords: "reserva tempo esgotou expirou cronometro timer acabou o tempo",
    body: [
      p("Ao começar a compra, um cronômetro no topo do checkout mostra o tempo que você tem para preencher os dados e pagar: **15 minutos**."),
      p("O código Pix vale até o fim desse mesmo prazo. Pague dentro dele e a confirmação aparece na tela sozinha."),
      p("O ingresso só é garantido quando o pagamento é aprovado. Em vendas muito disputadas, um lote pode esgotar enquanto você paga. Se isso acontecer depois da cobrança, **o valor é estornado automaticamente** e avisamos por e-mail."),
      h("O tempo acabou. E agora?"),
      p("Nada foi cobrado. É só voltar à página do evento e escolher os ingressos de novo. Se o lote tiver esgotado nesse meio-tempo, outro lote pode estar disponível."),
    ],
    related: ["pix-nao-confirmou"],
  },
  {
    slug: "fila-virtual", cat: "comprar",
    title: "Como funciona a fila virtual",
    summary: "Em vendas muito disputadas, as pessoas entram por ordem de chegada. A página libera sozinha quando chega a sua vez.",
    keywords: "fila virtual espera posicao muita gente travou lancamento",
    body: [
      p("Quando muita gente tenta comprar o mesmo evento ao mesmo tempo, a Tickets Win pode colocar todo mundo em uma **fila virtual**. Ela organiza a entrada por **ordem de chegada** e evita que o site trave para todos."),
      ul(
        "A tela mostra a sua posição e, quando dá para calcular, uma estimativa de espera.",
        "Quando chega a sua vez, a página libera a compra sozinha. Não precisa atualizar.",
        "Depois de liberado, você escolhe os ingressos e paga normalmente.",
      ),
      warn("Deixe a página aberta enquanto espera. É ela que avisa o sistema de que você continua na fila."),
      p("O produtor escolhe se a fila fica sempre ligada, se aparece só quando o movimento está alto ou se fica desligada."),
    ],
    related: ["pre-venda"],
  },
  {
    slug: "pre-venda", cat: "comprar",
    title: "Como participar da pré-venda e receber o aviso de abertura",
    summary: "Cadastre seu e-mail na página do evento. Na pré-venda, você recebe um link só seu para comprar antes da venda geral.",
    keywords: "pre venda prevenda link exclusivo me avise abertura das vendas lancamento contagem",
    body: [
      p("Alguns eventos mostram uma contagem regressiva antes de as vendas abrirem. Nessa página você pode:"),
      ul(
        "**Entrar na pré-venda:** deixe seu e-mail antes de a pré-venda começar. Quando ela abrir, você recebe por e-mail um **link exclusivo** para comprar antes de todo mundo.",
        "**Pedir o aviso de abertura:** um único e-mail na hora em que a venda geral abrir.",
      ),
      h("Regras do link da pré-venda"),
      ul(
        "O link é pessoal e vale para **uma compra**.",
        "Não compartilhe: ele libera a compra para quem abrir primeiro.",
        "Na página do evento, aparece o aviso \"Pré-venda liberada para você\" quando o link está ativo no seu navegador.",
      ),
      p("Depois que a pré-venda começa, o cadastro para ela fecha. Ainda dá para deixar o e-mail para o aviso da venda geral."),
      tip("Não recebeu o link? Procure na caixa de spam ou promoções por um e-mail com o nome do evento."),
    ],
    related: ["fila-virtual"],
  },
  {
    slug: "cupom-de-desconto", cat: "comprar",
    title: "Como usar um cupom de desconto",
    summary: "Digite o código no campo Cupom de desconto do checkout. O desconto aparece no resumo antes de pagar.",
    keywords: "cupom codigo desconto promocional promocao voucher invalido expirado esgotado",
    body: [
      p("Cupons são criados pelos produtores. Para usar:"),
      ol(
        "Na página do evento ou no resumo do checkout, toque em **Cupom de desconto**.",
        "Digite o código e confirme. O valor do desconto aparece no resumo do pedido.",
      ),
      p("Se você chegou por um link com cupom, ele já vem aplicado."),
      h("O cupom não funcionou"),
      ul(
        "**Cupom inválido ou expirado:** confira se digitou certo e se ainda está na validade.",
        "**Cupom esgotado:** o número de usos acabou.",
        "**Não vale para este evento:** o cupom é de outro evento.",
        "Alguns cupons valem só para um setor. Nesse caso, o desconto entra apenas nos ingressos daquele setor.",
      ),
      p("Vale um cupom por pedido. Cupons não se aplicam a compras na revenda oficial nem às partes de uma compra em grupo."),
    ],
  },
  {
    slug: "lotes-e-esgotado", cat: "comprar",
    title: "Lotes: em breve, esgotado e virada de lote",
    summary: "Cada tipo de ingresso tem quantidade e preço próprios. Entenda o que significa cada aviso na página do evento.",
    keywords: "lote esgotado em breve virada de lote preco mudou setor",
    body: [
      p("Os produtores vendem os ingressos em lotes e setores. Na página do evento cada opção mostra a situação dela:"),
      ul(
        "**Disponível:** pode comprar agora.",
        "**Em breve:** as vendas desse tipo começam em uma data marcada, que aparece na página.",
        "**Esgotado:** a quantidade daquele lote acabou.",
      ),
      p("Quando há uma próxima virada de lote programada, a página avisa. Depois dela, o preço pode mudar. O valor que vale é sempre o mostrado no checkout antes de pagar."),
      p("Se tudo esgotou, vale olhar a [revenda oficial](/ajuda/comprar-na-revenda) na página do evento: fãs que não podem ir anunciam ingressos lá."),
    ],
  },

  /* ============================== Pagamento e taxa ============================== */
  {
    slug: "formas-de-pagamento", cat: "pagamento",
    title: "Formas de pagamento aceitas",
    summary: "Pix, com aprovação na hora, e cartão de crédito em até 6x (até 3x sem juros), pagos dentro do próprio checkout.",
    keywords: "pagamento pix cartao credito debito boleto forma de pagar stripe seguro",
    body: [
      p("Na etapa de pagamento você escolhe entre:"),
      ul(
        "**Pix:** geramos um QR code e um código copia e cola. Pague pelo app do seu banco e a confirmação aparece no checkout sozinha. O código vale por 15 minutos.",
        "**Cartão de crédito:** em até 6 parcelas. De 1x a 3x é sem juros. Veja [como funciona o parcelamento](/ajuda/parcelamento).",
      ),
      p("O pagamento acontece **dentro do checkout da Tickets Win**, sem abrir outra página, e é processado pela Stripe. Os dados do cartão vão direto para a Stripe e não passam pelos nossos servidores. Na fatura, a compra aparece com o número do pedido."),
      p("No momento não aceitamos boleto."),
      p("A compra só é confirmada depois que o pagamento é aprovado. Ingressos gratuitos não passam por pagamento."),
    ],
    related: ["taxa-de-servico"],
  },
  {
    slug: "parcelamento", cat: "pagamento",
    title: "Parcelamento no cartão: até 6x",
    summary: "Até 3x sem juros. De 4x a 6x há juros de 2,99% por parcela sobre o total, mostrados antes de pagar.",
    keywords: "parcelar parcelas juros 6x 3x sem juros cartao",
    body: [
      p("No cartão de crédito você pode dividir o pedido em até **6 vezes**:"),
      ul(
        "**1x, 2x ou 3x:** sem juros.",
        "**4x, 5x ou 6x:** com juros de 2,99% multiplicados pelo número de parcelas, sobre o valor do pedido. Em 4x, por exemplo, o total fica 11,96% maior.",
      ),
      p("Na lista de parcelas o checkout mostra o valor de cada parcela e, quando há juros, o total final. Os juros aparecem também no resumo, na linha **Juros do parcelamento**."),
      h("Meu cartão não aceita parcelar"),
      p("Quem decide se o cartão aceita parcelamento é o banco emissor. Depois que você digita o cartão, o checkout confere e marca como **indisponível neste cartão** as parcelas que ele não aceita. Escolha outra quantidade, pague em 1x ou use outro cartão."),
      tip("Quer pagar o menor valor possível? Pix ou cartão em até 3x saem pelo mesmo preço."),
    ],
  },
  {
    slug: "taxa-de-servico", cat: "pagamento",
    title: "O que é a taxa de serviço de 7,99%",
    summary: "É a taxa da Tickets Win por ingresso. Aparece separada no checkout, antes de você pagar. Em alguns eventos o produtor paga por você.",
    keywords: "taxa de servico conveniencia 7,99 porcentagem por que pago taxa inclusa",
    body: [
      p("A taxa de serviço é de **7,99% do valor de cada ingresso**. Ela mantém a plataforma, o pagamento seguro, o QR code, a revenda oficial e o suporte."),
      ul(
        "É calculada sobre o valor dos ingressos depois da meia-entrada e do cupom. Se você paga meia, a taxa também cai pela metade.",
        "Aparece em uma linha própria no resumo, **antes** do pagamento. Sem surpresa na última tela.",
        "Ingressos gratuitos não têm taxa.",
      ),
      h("Taxa inclusa no preço"),
      p("Alguns produtores preferem pagar a taxa por você. Nesse caso o resumo mostra **Inclusa no preço** e você paga só o valor do ingresso."),
      p("Os juros do parcelamento em 4x ou mais são cobrados à parte e não fazem parte da taxa de serviço."),
    ],
    related: ["parcelamento", "pedir-reembolso"],
  },
  {
    slug: "pix-nao-confirmou", cat: "pagamento",
    title: "Paguei com Pix e a compra não confirmou",
    summary: "A confirmação costuma aparecer em segundos. Veja o que fazer se o código expirou ou o pedido não apareceu.",
    keywords: "pix nao confirmou expirou paguei e nao recebi codigo pix aguardando pagamento",
    body: [
      p("Depois de pagar o Pix, a tela de checkout mostra **Aguardando pagamento** e muda para **Pedido confirmado** assim que o pagamento chega. Normalmente leva poucos segundos."),
      h("Se não confirmou"),
      ol(
        "Confira em [Minha conta, Compras](/conta/compras) se o pedido aparece como pago.",
        "Veja no app do banco se o Pix saiu mesmo e se foi para o código certo.",
        "Lembre que o código Pix vale por 15 minutos. Se o pagamento chegar depois disso, tentamos emitir os ingressos mesmo assim. Se não houver mais ingressos, o valor é **estornado automaticamente** e você recebe um e-mail.",
      ),
      p("Escreva pelo [formulário de contato](/contato?assunto=pagamento) com o **número do pedido** e o comprovante do Pix. A gente localiza o pagamento e resolve."),
      warn("Não pague o mesmo código duas vezes. Se tiver dúvida, fale com a gente antes."),
    ],
    related: ["tempo-de-reserva", "nao-recebi-o-email"],
  },
  {
    slug: "ingresso-gratuito", cat: "pagamento",
    title: "Ingressos gratuitos e pedidos de valor zero",
    summary: "Evento grátis ou cupom de 100%: você só confirma os dados e garante o ingresso, sem pagamento e sem taxa.",
    keywords: "gratis gratuito free evento gratuito cupom 100 sem pagamento",
    body: [
      p("Quando o pedido fica com valor zero, seja porque o ingresso é grátis ou porque um cupom cobriu tudo, o checkout pula a etapa de pagamento. Basta preencher os dados e tocar em **Garantir ingresso**."),
      ul(
        "Não há taxa de serviço em ingressos gratuitos.",
        "O ingresso é nominal e tem QR code, como qualquer outro.",
        "Ingresso grátis não pode ir para a revenda nem entrar em compra em grupo. Se não puder ir, [transfira para alguém](/ajuda/transferir-ingresso).",
      ),
    ],
  },

  /* ============================== Meus ingressos ============================== */
  {
    slug: "onde-estao-meus-ingressos", cat: "meus-ingressos",
    title: "Onde encontro meus ingressos",
    summary: "Em Meus ingressos, na sua conta. Você também recebe a confirmação do pedido por e-mail.",
    keywords: "onde esta meu ingresso meus ingressos achar ingresso app qr code",
    body: [
      p("Todos os ingressos da sua conta ficam em [Meus ingressos](/meus-ingressos). Entre com o mesmo e-mail usado na compra."),
      ul(
        "**Próximos:** ingressos válidos para eventos que ainda vão acontecer.",
        "**Anteriores:** ingressos já usados, cancelados ou reembolsados, e eventos que já passaram.",
      ),
      p("Em cada ingresso você vê o QR code, o titular, o número do pedido e as opções de transferir, revender, salvar na carteira do celular ou adicionar à agenda."),
      p("O histórico de pedidos, com valores e forma de pagamento, fica em [Minha conta, Compras](/conta/compras)."),
    ],
    related: ["qr-code-na-entrada", "nao-recebi-o-email"],
  },
  {
    slug: "qr-code-na-entrada", cat: "meus-ingressos",
    title: "Como usar o QR code na entrada do evento",
    summary: "Mostre o QR no celular. Abra o ingresso antes de chegar para ele funcionar mesmo sem internet.",
    keywords: "qr code entrada portaria offline sem internet sinal brilho nao le imprimir",
    body: [
      p("Na portaria, a equipe lê o QR code do seu ingresso. Não precisa imprimir."),
      ol(
        "Antes de sair de casa, abra o ingresso em [Meus ingressos](/meus-ingressos). Assim o QR fica salvo no celular e funciona mesmo sem sinal no local.",
        "Na fila, aumente o brilho da tela.",
        "Leve um documento com foto: o ingresso é nominal e o produtor pode conferir.",
      ),
      h("Cada ingresso entra uma vez"),
      p("Depois de lido, o ingresso fica marcado como utilizado e não passa de novo. Se outra pessoa usar um print do seu QR antes de você, ela entra no seu lugar. Por isso, **nunca compartilhe o QR code**."),
      h("O QR não leu"),
      p("A equipe da portaria pode digitar o código do ingresso (no formato TW-XXXX-XXXX, que aparece embaixo do QR) ou buscar seu nome na lista do evento."),
      warn("Se o ingresso foi transferido ou vendido na revenda, o QR antigo deixa de valer na hora. Use sempre o QR que está na sua conta."),
    ],
    related: ["carteira-e-agenda", "golpes"],
  },
  {
    slug: "carteira-e-agenda", cat: "meus-ingressos",
    title: "Apple Wallet, Google Wallet, agenda e PDF",
    summary: "Salve o ingresso na carteira do celular, adicione o evento à agenda ou baixe o PDF para guardar.",
    keywords: "apple wallet google wallet carteira agenda calendario pdf imprimir salvar",
    body: [
      p("Na página de cada ingresso você encontra atalhos para ter tudo à mão:"),
      ul(
        "**Adicionar à Apple Wallet** ou **Salvar no Google Wallet:** o ingresso vira um passe na carteira do celular, com o QR code.",
        "**Adicionar à agenda:** baixa um arquivo com data, horário e local para o calendário do celular ou do computador.",
        "**PDF:** o ingresso com QR code para imprimir ou guardar.",
      ),
      p("Os botões de carteira aparecem quando o serviço está disponível. Se algum não aparecer ou der erro, use o QR code da própria página: ele funciona do mesmo jeito na portaria."),
      tip("Se você transferir ou revender o ingresso, o passe antigo na carteira deixa de valer, porque o QR code muda."),
    ],
  },
  {
    slug: "nao-recebi-o-email", cat: "meus-ingressos",
    title: "Não recebi o e-mail da compra",
    summary: "O ingresso não depende do e-mail: ele já está em Meus ingressos. Veja onde procurar a mensagem.",
    keywords: "nao recebi email confirmacao spam lixo eletronico promocoes",
    body: [
      p("Fique tranquilo: com o pedido confirmado, o ingresso já está em [Meus ingressos](/meus-ingressos), mesmo que o e-mail demore ou não chegue."),
      ol(
        "Procure na caixa de **spam**, **lixo eletrônico** ou na aba **Promoções**.",
        "Confira se o e-mail digitado na etapa de dados está certo. Ele aparece no resumo do pedido em [Minha conta, Compras](/conta/compras).",
        "Adicione os e-mails da Tickets Win (que terminam em @ticketswin.com.br) aos seus contatos para os próximos chegarem na caixa de entrada.",
      ),
      p("Se o pedido não aparece na sua conta, talvez a compra tenha sido feita com outro login. Entre com o outro e-mail ou [fale com a gente](/contato?assunto=ingressos) com o número do pedido."),
    ],
  },
  {
    slug: "nome-errado-no-ingresso", cat: "meus-ingressos",
    title: "O nome do titular saiu errado",
    summary: "Pequenos erros de digitação não costumam ser problema. Se o ingresso é para outra pessoa, transfira.",
    keywords: "nome errado titular corrigir trocar nome ingresso",
    body: [
      p("O nome do titular é o que você digitou no checkout. Hoje não há um botão para editar o nome depois da compra."),
      ul(
        "**Erro pequeno de digitação** (uma letra, um acento): leve o documento e explique na portaria. Se quiser corrigir antes, [fale com a gente](/contato?assunto=ingressos) com o número do pedido.",
        "**O ingresso é de outra pessoa:** use a [transferência](/ajuda/transferir-ingresso). Quando a pessoa aceita, o ingresso passa a ter o nome da conta dela.",
      ),
    ],
    related: ["ingresso-nominal"],
  },
  {
    slug: "ingresso-de-lista", cat: "meus-ingressos",
    title: "Estou na lista free de um evento",
    summary: "Nome na lista do produtor dá entrada gratuita. O QR chega por e-mail e aparece em Meus ingressos se o e-mail for o da sua conta.",
    keywords: "lista free lista vip cortesia convidado nome na lista entrada gratuita convite",
    body: [
      p("Alguns produtores colocam convidados em uma **lista free**: entrada gratuita, fora das vendas. Não é um pedido nem um ingresso comprado."),
      ul(
        "Se o produtor cadastrou o seu e-mail e enviou o convite, você recebe um **ingresso de lista com QR code** por e-mail.",
        "Se esse e-mail for o da sua conta (já confirmado), o ingresso aparece também em [Meus ingressos](/meus-ingressos), na seção **Lista free**.",
        "Sem QR? Diga o seu nome na portaria: a equipe procura na lista do evento.",
      ),
      p("Cada nome entra uma vez só, junto com os acompanhantes que o produtor liberou. A conferência de documento fica a critério do local."),
      warn("Ingresso de lista não pode ser transferido, revendido nem reembolsado. Dúvidas sobre a lista (nome, acompanhantes, horário) são com o produtor do evento."),
    ],
    related: ["qr-code-na-entrada"],
  },

  /* ============================== Transferir e revenda ============================== */
  {
    slug: "transferir-ingresso", cat: "transferencia",
    title: "Como transferir um ingresso para outra pessoa",
    summary: "Envie pelo e-mail, de graça. O QR antigo é cancelado na hora e a pessoa recebe um novo ao aceitar.",
    keywords: "transferir enviar mandar ingresso amigo outra pessoa email passar",
    body: [
      p("Se o produtor permitir transferências no evento, você pode mandar um ingresso para qualquer pessoa pelo e-mail dela. É gratuito."),
      ol(
        "Abra o ingresso em [Meus ingressos](/meus-ingressos) e toque em **Transferir**.",
        "Digite o e-mail de quem vai receber e confirme.",
        "A pessoa recebe um e-mail com um link. Ela entra na conta dela (ou cria uma) e aceita. O ingresso vai para a conta dela com um QR code novo e o nome dela como titular.",
      ),
      warn("Assim que você confirma, o QR code do seu ingresso deixa de valer. Mande só para alguém de confiança e confira o e-mail antes."),
      h("Quando não dá para transferir"),
      ul(
        "O produtor do evento desligou as transferências.",
        "O ingresso já foi usado ou não está mais válido.",
        "O ingresso está anunciado na revenda. Tire do anúncio antes.",
      ),
    ],
    related: ["cancelar-ou-aceitar-transferencia", "vender-na-revenda"],
  },
  {
    slug: "cancelar-ou-aceitar-transferencia", cat: "transferencia",
    title: "Aceitar ou cancelar uma transferência",
    summary: "Quem recebe aceita pelo link do e-mail. Quem enviou pode cancelar enquanto ninguém aceitou.",
    keywords: "aceitar transferencia link cancelar desfazer transferencia recebi ingresso",
    body: [
      h("Recebi um ingresso"),
      ol(
        "Abra o e-mail da Tickets Win e toque no link para aceitar.",
        "Entre na sua conta ou crie uma. O ingresso vai para a conta que estiver aberta nessa hora.",
        "Pronto: ele aparece em [Meus ingressos](/meus-ingressos) com um QR code novo.",
      ),
      h("Mandei e quero desfazer"),
      p("Enquanto a pessoa não aceitar, abra o ingresso em [Meus ingressos](/meus-ingressos) e toque em **Cancelar transferência**. O ingresso volta para você com um QR code novo."),
      p("Depois que a pessoa aceita, a transferência não pode mais ser desfeita por você. Se ela quiser devolver, pode transferir de volta."),
    ],
  },
  {
    slug: "vender-na-revenda", cat: "transferencia",
    title: "Como vender um ingresso na revenda oficial",
    summary: "Anuncie na página do evento até o preço máximo do produtor. Você recebe o valor anunciado menos 5%.",
    keywords: "revenda vender ingresso nao vou poder ir anunciar revender preco maximo",
    body: [
      p("Não vai poder ir? Se o produtor liberou a **revenda oficial** no evento, você anuncia o ingresso aqui mesmo, com segurança, sem passar o QR para desconhecidos."),
      ol(
        "Abra o ingresso em [Meus ingressos](/meus-ingressos) e toque em **Revender**.",
        "Defina o preço. O mínimo é R$ 5 e o máximo é definido pelo produtor do evento. O valor permitido aparece na tela.",
        "Confirme. O ingresso aparece na seção **Revenda oficial** da página do evento.",
      ),
      h("Quanto você recebe"),
      p("Você recebe o **valor anunciado menos 5%** da taxa da revenda. Quem compra paga o preço do anúncio mais a taxa de serviço normal. Quando a venda acontece, mandamos um e-mail com o valor que é seu."),
      h("Enquanto está anunciado"),
      ul(
        "O ingresso continua valendo para você até alguém comprar.",
        "Quando alguém compra, o seu QR code deixa de valer e o comprador recebe um novo.",
        "Você pode tirar o anúncio a qualquer momento, menos quando alguém está pagando por ele naquele instante. Nesse caso, espere alguns minutos.",
      ),
      warn("Ingressos gratuitos e ingressos já usados não podem ser anunciados. O produtor também pode tirar anúncios do ar."),
    ],
    related: ["comprar-na-revenda", "golpes"],
  },
  {
    slug: "comprar-na-revenda", cat: "transferencia",
    title: "Comprar um ingresso na revenda oficial",
    summary: "Ingressos de outros fãs, na página do evento, com QR code novo garantido para você.",
    keywords: "comprar revenda esgotou ingresso de outro fa segunda mao",
    body: [
      p("Na página do evento, a seção **Revenda oficial** lista os ingressos que outros fãs anunciaram, do mais barato ao mais caro."),
      ol(
        "Toque em **Comprar** no anúncio que você quer.",
        "Informe o titular e pague como em qualquer compra, por Pix ou cartão.",
        "Na confirmação, o ingresso passa para a sua conta com um **QR code novo**. O QR do vendedor deixa de valer na hora.",
      ),
      p("Enquanto você paga, o anúncio fica reservado para você por até 15 minutos. Na revenda o preço é travado: não há cupom nem meia-entrada no checkout. O valor do anúncio já considera o tipo de ingresso que está sendo vendido."),
      tip("Comprar pela revenda oficial é a forma segura de pegar um ingresso de outra pessoa: o ingresso é conferido e trocado de dono pela Tickets Win."),
    ],
    related: ["golpes"],
  },
  {
    slug: "golpes", cat: "transferencia",
    title: "Cuidado com golpes: compre só pela Tickets Win",
    summary: "Prints de QR code, transferências por fora e links falsos são os golpes mais comuns. Veja como se proteger.",
    keywords: "golpe fraude cambista print qr falso seguranca whatsapp instagram",
    body: [
      p("Ingresso comprado fora da plataforma não tem garantia nenhuma. Os golpes mais comuns:"),
      ul(
        "**Print de QR code:** a mesma imagem pode ser vendida para várias pessoas, e só a primeira entra. Se a pessoa transferir ou revender depois, o print para de valer.",
        "**Pagamento por fora:** pedir Pix direto para a conta de alguém e prometer \"transferir depois\".",
        "**Links falsos:** páginas que imitam a Tickets Win para roubar senha ou cartão.",
      ),
      h("Como se proteger"),
      ul(
        "Compre na página oficial do evento ou na **revenda oficial**.",
        "Para receber de um amigo, peça a **transferência pelo e-mail**. O ingresso só é seu quando aparece em [Meus ingressos](/meus-ingressos).",
        "Confira se o endereço do site é ticketswin.com.br antes de digitar sua senha.",
        "Ligue a [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas) na sua conta.",
      ),
      p("Viu um anúncio suspeito ou caiu em um golpe? [Conte para a gente](/contato?assunto=ingressos)."),
    ],
    related: ["verificacao-em-duas-etapas"],
  },

  /* ============================== Ingresso em grupo ============================== */
  {
    slug: "compra-em-grupo", cat: "grupo",
    title: "Como funciona a compra em grupo",
    summary: "Reserve vários ingressos de uma vez e mande um link: cada pessoa paga só a parte dela em até 60 minutos.",
    keywords: "grupo dividir amigos galera cada um paga sua parte rachar link",
    body: [
      p("Vai com a galera e ninguém quer adiantar o valor de todo mundo? Use a **compra em grupo**."),
      ol(
        "Na página do evento, escolha **2 ou mais ingressos** e toque na opção de compra em grupo.",
        "A Tickets Win **reserva as vagas por 60 minutos** e cria um link do grupo.",
        "Mande o link para os amigos. Cada pessoa, inclusive você, entra, escolhe uma vaga, informa o titular e paga só a dela.",
        "Cada um recebe o próprio ingresso na própria conta, com QR code próprio.",
      ),
      ul(
        "O grupo segue o máximo de ingressos por compra do evento.",
        "Cada parte custa o preço do ingresso mais a taxa de serviço. Na parte do grupo não há cupom nem meia-entrada.",
        "Ingressos gratuitos não entram em grupo: cada pessoa garante o seu.",
      ),
      tip("Na página do grupo dá para ver quais vagas já foram pagas e quanto tempo falta."),
    ],
    related: ["grupo-prazo"],
  },
  {
    slug: "grupo-prazo", cat: "grupo",
    title: "O que acontece se alguém do grupo não pagar",
    summary: "Depois de 60 minutos, as vagas não pagas voltam para a venda. Quem já pagou continua com o ingresso.",
    keywords: "grupo tempo acabou expirou nao pagou cancelar grupo vaga",
    body: [
      p("A reserva do grupo dura **60 minutos**. Quando o tempo acaba:"),
      ul(
        "Quem já pagou continua com o ingresso, normalmente.",
        "As vagas não pagas voltam para a venda geral.",
        "Quem não pagou ainda pode tentar comprar pelo caminho normal, se houver ingressos.",
      ),
      h("Cancelar o grupo"),
      p("Só quem criou o grupo pode cancelar. As vagas não pagas voltam para a venda e quem já pagou fica com o ingresso."),
      h("\"Outra pessoa está pagando esta parte\""),
      p("Quando alguém começa a pagar uma vaga, ela fica guardada para essa pessoa por alguns minutos. Escolha outra vaga livre do grupo."),
    ],
  },

  /* ============================== Meia-entrada ============================== */
  {
    slug: "quem-tem-direito-a-meia", cat: "meia-entrada",
    title: "Quem tem direito à meia-entrada",
    summary: "Estudantes, pessoas com deficiência e acompanhante, jovens de baixa renda e pessoas com 60 anos ou mais.",
    keywords: "meia entrada direito estudante idoso pcd deficiencia id jovem baixa renda lei",
    body: [
      p("A meia-entrada é garantida pela Lei 12.933/2013 e pelo Estatuto da Pessoa Idosa. Têm direito a pagar 50% do valor da inteira:"),
      ul(
        "**Estudantes** com a Carteira de Identificação Estudantil (CIE) válida.",
        "**Pessoas com deficiência** e, quando necessário, um acompanhante.",
        "**Jovens de 15 a 29 anos de baixa renda** inscritos no CadÚnico, com a ID Jovem.",
        "**Pessoas com 60 anos ou mais.**",
      ),
      p("A lei reserva para a meia-entrada 40% dos ingressos de cada evento. Esse controle é do produtor."),
      p("Alguns estados e municípios têm leis com outros beneficiários, como professores. Quando o produtor oferece esses descontos, eles aparecem como tipos de ingresso próprios na página do evento."),
    ],
    related: ["comprar-meia-entrada", "pcd-no-evento"],
  },
  {
    slug: "comprar-meia-entrada", cat: "meia-entrada",
    title: "Como comprar meia-entrada e o que levar",
    summary: "Marque meia-entrada no titular, na etapa de dados. Na portaria, apresente o documento que comprova o direito.",
    keywords: "como comprar meia documento comprovante carteira estudante portaria diferenca",
    body: [
      p("Em eventos com ingresso de inteira, a meia é escolhida **por titular**:"),
      ol(
        "Na etapa **Dados** do checkout, informe o nome do titular.",
        "Marque a opção **Meia-entrada** nesse titular. O preço daquele ingresso cai para a metade, e a taxa de serviço também.",
        "Termine a compra normalmente. O ingresso fica marcado como meia.",
      ),
      p("Alguns eventos já trazem a meia como um tipo de ingresso separado. Nesse caso é só escolher esse tipo na página do evento."),
      h("O que levar"),
      ul(
        "Estudante: CIE válida (física ou digital).",
        "Pessoa com deficiência: cartão de benefício ou documento que comprove a deficiência.",
        "Jovem de baixa renda: ID Jovem e documento com foto.",
        "60 anos ou mais: documento oficial com foto.",
      ),
      warn("Sem o documento, a portaria pode cobrar a diferença ou recusar a entrada, conforme a política do evento. Compre meia só se o titular tiver o comprovante em mãos."),
    ],
  },
  {
    slug: "meia-social-e-outros-tipos", cat: "meia-entrada",
    title: "Meia social e outros tipos de ingresso",
    summary: "Além de inteira e meia, o produtor pode criar meia social, ingresso grátis e tipos próprios.",
    keywords: "meia social alimento doacao kg tipo de ingresso solidario promocional",
    body: [
      p("Na página do evento cada tipo mostra uma descrição feita pelo produtor. Os mais comuns:"),
      ul(
        "**Inteira:** o preço cheio. Em geral permite marcar meia-entrada no checkout.",
        "**Meia-entrada:** metade da inteira, para quem tem direito por lei.",
        "**Meia social (ou ingresso solidário):** um preço com desconto em troca de uma doação, como 1 kg de alimento não perecível. Leve a doação na entrada.",
        "**Gratuito:** sem preço e sem taxa.",
        "**Tipos próprios:** camarote, open bar, primeiro lote e o que o produtor criar.",
      ),
      p("Tipos que já têm preço próprio, como meia e meia social, não somam outro desconto de meia no checkout. Leia a descrição do tipo antes de comprar."),
    ],
  },

  /* ============================== Reembolsos ============================== */
  {
    slug: "pedir-reembolso", cat: "reembolsos",
    title: "Como pedir reembolso (direito de arrependimento)",
    summary: "Até 7 dias após o pagamento, desde que faltem mais de 48 horas para o evento. Você cancela pelo próprio ingresso, em Meus ingressos.",
    keywords: "reembolso devolucao estorno desistir arrependimento cancelar compra 7 dias 48 horas dinheiro de volta",
    body: [
      p("Pelo Código de Defesa do Consumidor, você pode desistir de uma compra feita pela internet. Na Tickets Win a regra é:"),
      ul(
        "Peça em até **7 dias depois do pagamento**;",
        "e desde que faltem **mais de 48 horas** para o início do evento.",
      ),
      h("Como pedir"),
      ol(
        "Abra o ingresso em [Meus ingressos](/meus-ingressos) e desça até **Cancelamento e reembolso**.",
        "Toque em **Cancelar ingresso**. O valor que volta para você aparece antes de confirmar.",
        "Confirme. O cancelamento é na hora e você recebe um e-mail com o valor.",
      ),
      p("Cada ingresso é cancelado separadamente, e só quem comprou pode cancelar (o dinheiro volta para quem pagou). Ingressos comprados na revenda oficial não são cancelados por aqui. Se o botão não aparecer, [fale com a gente](/contato?assunto=reembolso) com o número do pedido."),
      p("Com o reembolso aprovado, os ingressos são cancelados e o QR code deixa de valer. O valor volta pelo mesmo meio de pagamento: no Pix, para a conta de origem; no cartão, como estorno na fatura. O prazo para aparecer depende do seu banco ou da operadora do cartão."),
      p("Fora desse prazo, vale a [política de cancelamento do evento](/ajuda/politica-do-evento), definida pelo produtor. Se ela permitir, o botão **Cancelar ingresso** continua aparecendo até o prazo dela."),
    ],
    related: ["evento-cancelado", "evento-adiado"],
  },
  {
    slug: "evento-cancelado", cat: "reembolsos",
    title: "O evento foi cancelado",
    summary: "O reembolso é integral e automático, inclusive a taxa de serviço. Você não precisa pedir.",
    keywords: "evento cancelado show cancelado reembolso automatico integral",
    body: [
      p("Se o evento for cancelado, você recebe **todo o valor pago de volta, inclusive a taxa de serviço**, sem precisar pedir."),
      ul(
        "O valor volta pelo mesmo meio de pagamento usado na compra. O prazo para aparecer depende do seu banco ou da operadora do cartão.",
        "Os ingressos aparecem como cancelados ou reembolsados em [Meus ingressos](/meus-ingressos).",
      ),
      p("Passou um tempo e o valor não apareceu? [Fale com a gente](/contato?assunto=reembolso) com o número do pedido."),
    ],
  },
  {
    slug: "evento-adiado", cat: "reembolsos",
    title: "O evento foi adiado ou mudou de data",
    summary: "Seu ingresso continua valendo para a nova data. Se não puder ir, peça reembolso em até 7 dias após o anúncio.",
    keywords: "evento adiado remarcado nova data mudou data mudou local",
    body: [
      p("Quando o produtor adia um evento, **o seu ingresso continua válido para a nova data**, com o mesmo QR code. Não precisa fazer nada."),
      p("Se a nova data não der para você, peça o reembolso em até **7 dias depois do anúncio** do adiamento: abra o ingresso em [Meus ingressos](/meus-ingressos) e toque em **Pedir reembolso**. O produtor aprova e o valor integral volta pelo mesmo meio de pagamento."),
      h("Outras opções"),
      ul(
        "[Transferir](/ajuda/transferir-ingresso) o ingresso para alguém que possa ir.",
        "[Anunciar na revenda oficial](/ajuda/vender-na-revenda), se o evento permitir.",
      ),
      p("Mudanças de atrações, horários ou local são de responsabilidade do produtor e aparecem na página do evento."),
    ],
  },
  {
    slug: "politica-do-evento", cat: "reembolsos",
    title: "Política de cancelamento de cada evento",
    summary: "Fora do prazo de 7 dias, vale o que o produtor definiu. Ela aparece na página do evento, em Cancelamento.",
    keywords: "politica de cancelamento produtor regra fora do prazo nao posso ir",
    body: [
      p("Cada evento mostra a política de cancelamento do produtor na seção **O que você deve saber**, item **Cancelamento**. Leia antes de comprar."),
      p("Ela vale para pedidos fora do [direito de arrependimento](/ajuda/pedir-reembolso), ou seja, depois de 7 dias do pagamento ou a menos de 48 horas do evento. O produtor pode liberar o cancelamento até alguns dias ou horas antes do evento. Nesses cancelamentos fora dos 7 dias, a taxa de serviço não é devolvida. Nos casos de [cancelamento](/ajuda/evento-cancelado) e [adiamento](/ajuda/evento-adiado), valem as regras da Tickets Win."),
      p("Não vai poder ir e o prazo passou? Você ainda pode [transferir o ingresso](/ajuda/transferir-ingresso) ou [vender na revenda oficial](/ajuda/vender-na-revenda), se o evento permitir."),
    ],
  },

  /* ============================== Conta e segurança ============================== */
  {
    slug: "criar-e-ativar-conta", cat: "conta",
    title: "Criar e ativar sua conta",
    summary: "Cadastre-se com e-mail e senha ou com o Google. No cadastro por e-mail, confirme com o código de 6 números.",
    keywords: "criar conta cadastro ativar conta codigo de ativacao confirmar email google",
    body: [
      p("Você pode criar a conta de dois jeitos:"),
      ul(
        "**Com o Google:** um toque e pronto. Nesse caso a conta não tem senha na Tickets Win, você entra sempre pelo Google.",
        "**Com e-mail e senha:** informe nome e sobrenome (como no documento), e-mail, celular com DDD e uma senha de pelo menos 8 caracteres, e aceite os Termos de uso.",
      ),
      h("Ativar a conta"),
      p("No cadastro por e-mail, enviamos um **código de 6 números** para confirmar que o endereço é seu. Digite o código na tela de ativação ou toque no botão do e-mail."),
      tip("O código não chegou? Veja a caixa de spam ou promoções e confira se o e-mail foi digitado certo. Dá para pedir outro código na própria tela."),
    ],
    related: ["verificacao-em-duas-etapas"],
  },
  {
    slug: "verificacao-em-duas-etapas", cat: "conta",
    title: "Verificação em duas etapas",
    summary: "Além da senha, todo login pede um código do app autenticador ou do e-mail. Mesmo que alguém descubra sua senha, não consegue entrar.",
    keywords: "duas etapas 2fa autenticador codigo login seguranca google authenticator verificacao",
    body: [
      p("Ligue em [Minha conta, Privacidade e segurança](/conta/seguranca). Você escolhe como receber o código:"),
      ul(
        "**App autenticador (recomendado):** Google Authenticator, Microsoft Authenticator, 1Password, iCloud Senhas e outros. Você escaneia um QR code e digita o código de 6 números que o app mostra. Ao ligar, você recebe **10 códigos de recuperação**.",
        "**Código por e-mail:** a cada login, mandamos um código de 6 números para o seu e-mail.",
      ),
      p("Com a verificação ligada, **todo login pede o código**, em qualquer aparelho, mesmo nos que você já usou. Não existe a opção de \"confiar neste aparelho\": é assim que a sua conta fica protegida mesmo se alguém descobrir a senha."),
      h("Detalhes do código por e-mail"),
      ul(
        "Você tem até 5 tentativas por código. Depois disso, peça outro.",
        "O código vale por 10 minutos. Dá para pedir um novo a cada 30 segundos, com um limite por hora.",
      ),
      h("Trocar de celular ou desligar"),
      p("Para cadastrar o app em outro celular, ou para trocar o app pelo código por e-mail, digite primeiro o código do app que você usa hoje. Para desligar, confirme com o código do app ou com o código enviado por e-mail."),
      tip("O Banco Tickets Win, usado por produtores para sacar, exige o app autenticador."),
    ],
    related: ["perdi-o-celular", "aparelhos-conectados"],
  },
  {
    slug: "perdi-o-celular", cat: "conta",
    title: "Perdi o celular com o app autenticador",
    summary: "Use um dos códigos de recuperação que você guardou ao ligar a verificação. Cada um vale uma vez.",
    keywords: "perdi celular codigo de recuperacao trocar celular nao tenho acesso autenticador roubado",
    body: [
      p("Ao ligar a verificação com o app autenticador, mostramos **10 códigos de recuperação**, uma vez só. Eles servem exatamente para isso."),
      ol(
        "Entre com seu e-mail e senha.",
        "Na tela do código, toque em **Perdi o celular: usar código de recuperação**.",
        "Digite um dos códigos guardados. Cada código vale uma única vez.",
        "Já dentro da conta, vá em [Privacidade e segurança](/conta/seguranca) e cadastre o app no celular novo.",
      ),
      p("Os códigos estão acabando? Gere novos em Privacidade e segurança, com o código do app. Os antigos deixam de valer."),
      h("Não tenho os códigos"),
      p("[Fale com a gente](/contato?assunto=conta) pelo e-mail da conta. Por segurança, vamos confirmar que a conta é sua antes de qualquer mudança."),
    ],
  },
  {
    slug: "esqueci-a-senha", cat: "conta",
    title: "Esqueci a senha ou quero trocar",
    summary: "Peça um link por e-mail. Ele vale por 15 minutos e serve uma vez só.",
    keywords: "esqueci a senha trocar senha redefinir senha link nao recebi recuperar acesso",
    body: [
      h("Esqueci a senha"),
      ol(
        "Na tela de entrar, toque em **Esqueci a senha** ou abra [esta página](/esqueci-senha).",
        "Digite o e-mail da conta. Se ele tiver cadastro, enviamos um link.",
        "Abra o link em até **15 minutos** e crie uma senha nova com pelo menos 8 caracteres.",
      ),
      h("Quero trocar a senha"),
      p("Por segurança, a troca de senha é sempre feita **por um link no e-mail**, nunca direto na tela. Em [Minha conta, Privacidade e segurança](/conta/seguranca), toque em trocar a senha: o link vai para o e-mail da própria conta, vale por 15 minutos e serve uma vez só."),
      p("Quando a senha muda, avisamos por e-mail e os outros aparelhos conectados saem da conta. Se você não reconhece a troca, [fale com a gente](/contato?assunto=conta) na hora."),
      tip("Conta criada com o Google não tem senha na Tickets Win. A senha e a segurança do acesso ficam na sua conta Google."),
    ],
    related: ["aparelhos-conectados"],
  },
  {
    slug: "trocar-email", cat: "conta",
    title: "Como trocar o e-mail da conta",
    summary: "Em três passos: código no e-mail atual, código no e-mail novo e confirmação. O e-mail antigo recebe um aviso.",
    keywords: "trocar email mudar email alterar email da conta",
    body: [
      p("A troca é feita em [Minha conta](/conta) e protege você contra quem tente roubar a conta:"),
      ol(
        "**Autorize:** mandamos um código para o seu e-mail atual. Digite para liberar a troca. A autorização vale por 15 minutos.",
        "**Confirme o novo:** digite o e-mail novo. Mandamos um código para ele.",
        "**Pronto:** com o código certo, o e-mail de acesso muda na hora. O e-mail antigo recebe um aviso da mudança.",
      ),
      p("Não dá para usar um e-mail que já tem conta na Tickets Win."),
      tip("Seus ingressos continuam na conta. Só o e-mail de acesso e de avisos muda."),
    ],
  },
  {
    slug: "aparelhos-conectados", cat: "conta",
    title: "Aparelhos conectados e atividade suspeita",
    summary: "Veja onde sua conta está aberta, desconecte aparelhos e confira o histórico de segurança.",
    keywords: "aparelhos conectados sessoes desconectar invadiram conta hackeada suspeita",
    body: [
      p("Em [Privacidade e segurança](/conta/seguranca) você encontra:"),
      ul(
        "**Aparelhos conectados:** onde sua conta está aberta agora. Dá para desconectar um aparelho ou todos os outros de uma vez.",
        "**Histórico de segurança:** entradas e mudanças importantes, como troca de senha ou de e-mail.",
      ),
      h("Acho que alguém entrou na minha conta"),
      ol(
        "Desconecte os aparelhos que você não reconhece.",
        "[Troque a senha](/ajuda/esqueci-a-senha).",
        "Ligue a [verificação em duas etapas](/ajuda/verificacao-em-duas-etapas).",
        "Confira seus ingressos e, se algo mudou sem você saber, [fale com a gente](/contato?assunto=conta).",
      ),
    ],
  },
  {
    slug: "seus-dados", cat: "conta",
    title: "Baixar meus dados ou excluir a conta",
    summary: "Peça pelo formulário de contato com o e-mail da conta. Cuidamos dos seus dados conforme a LGPD.",
    keywords: "lgpd dados pessoais excluir conta apagar conta baixar dados privacidade",
    body: [
      p("Você pode pedir uma cópia dos seus dados ou a exclusão da conta. Escreva pelo [formulário de contato](/contato?assunto=conta) usando o **mesmo e-mail da conta** e diga o que precisa."),
      ul(
        "Antes de excluir, confira se não há ingressos válidos para eventos futuros: eles deixam de existir junto com a conta.",
        "Alguns registros, como os de pedidos pagos, precisam ser guardados pelo tempo que a lei exige.",
      ),
      p("Detalhes sobre o que coletamos e por quê estão na [Política de privacidade](/legal/privacidade)."),
      p("Quer só parar de receber novidades? Desligue **Novidades e eventos por e-mail** em [Privacidade e segurança](/conta/seguranca). Avisos do seu pedido e dos ingressos continuam chegando."),
    ],
  },

  /* ============================== Acessibilidade ============================== */
  {
    slug: "acessibilidade-no-site", cat: "acessibilidade",
    title: "Acessibilidade no site e no app",
    summary: "O que já fazemos para que todo mundo consiga comprar, e como avisar de uma barreira.",
    keywords: "acessibilidade leitor de tela teclado contraste wcag libras deficiencia visual",
    body: [
      p("Queremos que qualquer pessoa consiga encontrar um evento e comprar o ingresso, do jeito que usa a internet. Nossa meta é seguir as diretrizes WCAG 2.2, nível AA."),
      ul(
        "Navegação por teclado, com foco visível.",
        "Compatibilidade com leitores de tela como NVDA, VoiceOver e TalkBack.",
        "Respeito à preferência de reduzir movimento do sistema.",
        "Código alfanumérico no ingresso, que a portaria pode digitar quando o QR não é lido.",
      ),
      p("Encontrou uma barreira? Escreva para acessibilidade@ticketswin.com.br contando a página e a tecnologia assistiva que você usa. Mais detalhes na página de [Acessibilidade](/legal/acessibilidade)."),
    ],
  },
  {
    slug: "pcd-no-evento", cat: "acessibilidade",
    title: "Pessoa com deficiência no evento",
    summary: "Meia-entrada para a pessoa com deficiência e acompanhante, e como tirar dúvidas sobre o local.",
    keywords: "pcd deficiente cadeira de rodas acompanhante meia acessibilidade do local",
    body: [
      p("Pessoas com deficiência têm direito à [meia-entrada](/ajuda/quem-tem-direito-a-meia) e, quando necessário, o acompanhante também. Marque a meia em cada titular na etapa de dados e leve o documento que comprova o direito."),
      h("Acessibilidade do local"),
      p("As condições do espaço (acesso para cadeira de rodas, banheiros adaptados, área reservada, intérprete de Libras) são de responsabilidade do produtor. Antes de comprar, fale com ele pelo botão **Falar com o produtor**, na página do evento."),
      p("Se não conseguir resposta, [fale com a gente](/contato) com o nome do evento que a gente ajuda a fazer a ponte."),
    ],
    related: ["comprar-meia-entrada"],
  },

  /* ============================== Para produtores ============================== */
  {
    slug: "virar-produtor", cat: "produtores",
    title: "Como virar produtor: inscrição e aprovação",
    summary: "Envie a inscrição em Criar evento. A equipe responde por e-mail no mesmo dia útil.",
    keywords: "produtor inscricao aprovacao criar conta de produtor vender ingressos organizador",
    body: [
      p("Cada produtor é aprovado pela equipe da Tickets Win. Assim a plataforma continua segura para quem compra e justa para quem produz."),
      ol(
        "Entre na sua conta e abra [Criar evento](/criar-evento).",
        "Preencha a inscrição: nome, telefone, produtora (se tiver), cidade e estado, categoria, público, ticket médio, público esperado e Instagram.",
        "Respondemos **no mesmo dia útil**, no e-mail da sua conta.",
        "Aprovado, você completa o cadastro de produtor: nome público, cidade, Instagram e uma frase. Isso cria a sua página de produtor e libera o [painel](/painel).",
      ),
      p("Se a inscrição não for aprovada, você pode mandar uma nova com mais detalhes sobre os seus eventos."),
      p("Para conhecer as condições, veja a página [Para produtores](/produtores)."),
    ],
    related: ["criar-evento"],
  },
  {
    slug: "criar-evento", cat: "produtores",
    title: "Como criar e publicar um evento",
    summary: "Um passo a passo guiado: formato, informações, data, local, mapa, ingressos, artes e abertura das vendas.",
    keywords: "criar evento publicar rascunho cadastrar evento editar evento",
    body: [
      p("Em [Criar evento](/criar-evento), o formulário guia você por etapas, com uma prévia ao lado:"),
      ol(
        "**Formato:** evento único, temporada ou turnê, e venda simples ou com mapa por setor.",
        "**Informações:** nome, categoria, classificação, descrição e line-up.",
        "**Data e horário:** uma ou várias datas. Cada data vira uma sessão que o público escolhe.",
        "**Local:** busque o endereço real para o mapa e o \"Como chegar\".",
        "**Mapa do local:** opcional, para vender por setor no [mapa 3D](/ajuda/mapa-3d).",
        "**Ingressos:** setores, tipos, preços, quantidades e limite por pessoa. Veja [lotes e setores](/ajuda/lotes-e-setores).",
        "**Artes:** pôster, banner e imagens de divulgação.",
        "**Abertura das vendas:** vender já ou marcar data, com pré-venda opcional. Veja [lançamento](/ajuda/lancamento-e-pre-venda).",
      ),
      p("Na publicação você escolhe a visibilidade: **público** (aparece no site), **só com link** ou **rascunho**. Depois de publicado, o evento é gerido em [Meus eventos](/meus-eventos) e no [painel](/painel)."),
      tip("Defina também a política de cancelamento, quem paga a taxa e se o público pode transferir e revender. Esses padrões podem ser salvos em Painel, Configurações."),
    ],
  },
  {
    slug: "lotes-e-setores", cat: "produtores",
    title: "Tipos de ingresso, lotes e setores",
    summary: "Organize por setor e crie inteira, meia, meia social, gratuito ou tipos próprios, com quantidade e limite por pessoa.",
    keywords: "lote setor tipo de ingresso meia automatica limite por pessoa quantidade virada",
    body: [
      p("Na etapa **Ingressos** você monta a estrutura de venda:"),
      ul(
        "**Setores:** Pista, Camarote, Área VIP... cada um com nome e cor. Com mapa 3D, cada setor é uma área que o público escolhe no mapa.",
        "**Tipos dentro de cada setor:** inteira, meia-entrada (50% por lei), meia social, gratuito ou um tipo seu.",
        "**Preço, quantidade e limite por pessoa** de cada tipo. O limite por pessoa vai até 20.",
      ),
      p("Com **meia-entrada automática** ligada, o comprador pode marcar meia em cada ingresso de inteira, pagando 50%. Use lotes diferentes (1º lote, 2º lote...) como tipos separados, cada um com preço e quantidade."),
      p("Os compradores veem cada lote como disponível, em breve ou esgotado. Para ajustar depois da publicação, use **Gerenciar lotes e cupons**, no painel do evento."),
    ],
    related: ["mapa-3d", "taxa-para-produtores"],
  },
  {
    slug: "mapa-3d", cat: "produtores",
    title: "Mapa 3D do local",
    summary: "Mande uma foto do rascunho, a planta ou uma descrição. A IA monta o mapa e você ajusta no editor.",
    keywords: "mapa 3d planta setores palco ia mapa do local editor",
    body: [
      p("Com venda por setor, o público escolhe onde ficar em um mapa 3D do local. Para criar:"),
      ol(
        "Na etapa **Formato**, escolha a venda com mapa.",
        "Na etapa **Mapa do local**, envie a foto de um rascunho no papel ou a planta (JPG ou PNG), ou descreva o espaço. Exemplo: \"Galpão 40×60 m, palco no fundo, camarotes nas laterais\". Também dá para começar de uma planta pronta.",
        "A IA identifica palco, setores, bares e entradas e monta o mapa.",
        "No editor, ajuste as áreas e ligue cada setor do mapa a um setor de ingressos.",
      ),
      warn("A IA pode errar medidas. Confira a lotação de cada área com a planta oficial do local antes de publicar."),
    ],
  },
  {
    slug: "taxa-para-produtores", cat: "produtores",
    title: "Taxa de 7,99%: repassar ao comprador ou absorver",
    summary: "Você escolhe por evento. Repassada, aparece à parte no checkout. Absorvida, sai do seu repasse.",
    keywords: "taxa produtor absorver repassar comprador paga a taxa 7,99 repasse",
    body: [
      p("A taxa da Tickets Win é de **7,99% por ingresso**. Em cada evento você decide quem paga:"),
      ul(
        "**Comprador paga a taxa:** o preço aparece com \"+ taxas\" e a taxa entra à parte no checkout. Você recebe o valor cheio dos ingressos.",
        "**Você absorve:** o comprador vê o preço final, com a taxa inclusa, e os 7,99% saem do seu repasse.",
      ),
      p("Ingressos gratuitos não têm taxa. Os juros do parcelamento em 4x ou mais ficam com o comprador e não entram no seu repasse."),
      p("O padrão para eventos novos fica em [Painel, Configurações](/painel/configuracoes)."),
    ],
  },
  {
    slug: "lancamento-e-pre-venda", cat: "produtores",
    title: "Lançamento: abertura das vendas, pré-venda e fila",
    summary: "Marque a abertura, crie uma pré-venda com link exclusivo e escolha como a fila virtual funciona.",
    keywords: "lancamento abertura das vendas pre venda contagem regressiva fila virtual teaser lista de aviso",
    body: [
      p("No painel do evento, a aba **Lançamento** reúne:"),
      ul(
        "**Abertura das vendas:** a data e hora em que a venda geral começa (horário de Brasília). Até lá, a página mostra uma contagem regressiva e coleta e-mails para o aviso de abertura. No minuto marcado, a compra libera sozinha.",
        "**Pré-venda:** opcional, antes da abertura. Quem se cadastra recebe por e-mail um link exclusivo, que vale para uma compra.",
        "**Tela de contagem:** em Personalizar a tela, o tema, o título e a mensagem que o público vê antes da abertura.",
        "**Fila virtual:** automática (só aparece com muita gente ao mesmo tempo), sempre ligada ou desligada, com o número de pessoas comprando ao mesmo tempo.",
      ),
      p("Você acompanha a lista de cadastrados, exporta em CSV, reenvia os links da pré-venda, avisa a lista na hora e remove alguém, se precisar. Os cadastrados também podem ser público dos seus [e-mails de marketing](/ajuda/email-marketing)."),
    ],
    related: ["fila-virtual", "pre-venda"],
  },
  {
    slug: "portaria-e-check-in", cat: "produtores",
    title: "Portaria e check-in no dia do evento",
    summary: "Crie acessos de check-in no painel e a equipe valida os ingressos pela câmera do celular, sem precisar de conta.",
    keywords: "portaria check-in checkin validar ingresso leitor qr equipe entrada app da portaria",
    body: [
      p("A validação dos ingressos é feita pelo **app da portaria**, que roda no navegador do celular."),
      ol(
        "No painel do evento, em **Check-in**, crie um acesso para cada equipe ou entrada. Cada acesso tem um código curto (no formato XXXX-XXXX) e um link.",
        "Quem está na porta abre [/portaria](/portaria) e digita o código, ou abre o link. Dá para instalar na tela de início, como um app.",
        "Aponte a câmera para o QR do ingresso. A tela mostra na hora se o ingresso é válido, já foi usado, foi transferido ou é de outro evento.",
      ),
      ul(
        "Cada ingresso entra **uma vez só**, mesmo com várias portarias lendo ao mesmo tempo.",
        "Sem QR? Busque o nome na lista ou digite o código do ingresso e libere manualmente.",
        "O leitor também reconhece os convites da [lista free](/ajuda/lista-free) e os nomes da lista aparecem na busca.",
        "A contagem de quem já entrou é atualizada entre todas as portarias.",
        "Desligou o acesso no painel, ele para de funcionar na hora. Os acessos encerram sozinhos um dia depois do fim do evento.",
      ),
    ],
    related: ["equipe-do-evento", "lista-free"],
  },
  {
    slug: "lista-free", cat: "produtores",
    title: "Lista free: convidados com entrada gratuita",
    summary: "Adicione nomes no painel do evento, mande o QR por e-mail e libere na portaria. A lista não vira venda nem ingresso.",
    keywords: "lista free lista vip cortesia convidados nomes guest list acompanhantes convite gratuito",
    body: [
      p("No painel do evento, a aba **Lista free** guarda os convidados que entram de graça. Ela fica à parte das vendas: não gera pedido, receita, taxa, revenda nem transferência."),
      h("Adicionar nomes"),
      ul(
        "**Um nome:** nome, e-mail (opcional), número de acompanhantes e uma observação.",
        "**Colar vários:** um por linha, no formato \"Nome; e-mail; +2\". E-mail e acompanhantes são opcionais. Até 200 nomes por vez e 2.000 por evento.",
        "Nomes ou e-mails repetidos são ignorados e o painel mostra quais linhas ficaram de fora.",
      ),
      h("Convite com QR code"),
      p("Marque **Enviar o ingresso de lista por e-mail** para mandar o QR para quem tem e-mail. Dá para reenviar um convite ou mandar para todos que ainda não receberam. Quem tem conta com aquele e-mail vê o convite em Meus ingressos."),
      h("Na portaria"),
      ul(
        "O [app da portaria](/ajuda/portaria-e-check-in) lê o QR do convite e mostra \"Entrada gratuita\" com os acompanhantes.",
        "Sem QR, a equipe busca o nome na lista e libera.",
        "Cada nome entra uma vez só, com os acompanhantes. Liberou por engano? Use **Desfazer entrada** no painel.",
      ),
    ],
    related: ["portaria-e-check-in", "equipe-do-evento"],
  },
  {
    slug: "equipe-do-evento", cat: "produtores",
    title: "Equipe: administradores e portaria",
    summary: "Convide pessoas pelo e-mail com o papel de administrador ou de portaria.",
    keywords: "equipe convidar membro administrador socio portaria permissao acesso painel",
    body: [
      p("Em [Painel, Equipe e portaria](/painel/equipe), convide pessoas pelo e-mail:"),
      ul(
        "**Administrador:** ajuda a gerir os eventos, cupons e marketing.",
        "**Portaria:** só faz o check-in dos ingressos.",
      ),
      p("O **dono** da conta de produtor é o único que vê a conta de repasse e acessa o [Banco Tickets Win](/ajuda/financeiro-e-saques)."),
      tip("Para quem só vai validar ingressos no dia, um acesso de check-in sem conta costuma ser mais prático. Veja [portaria e check-in](/ajuda/portaria-e-check-in)."),
    ],
  },
  {
    slug: "financeiro-e-saques", cat: "produtores",
    title: "Financeiro, Banco Tickets Win e saques",
    summary: "As vendas ficam disponíveis 2 dias após o fim do evento. O saque mínimo é de R$ 10 e exige o app autenticador.",
    keywords: "financeiro saque repasse banco tickets win receber dinheiro saldo conta de repasse pix",
    body: [
      p("O dinheiro das vendas fica no **Banco Tickets Win**, a carteira do dono dos eventos. O acesso é separado do site, com senha própria."),
      h("Quando o dinheiro fica disponível"),
      ul(
        "Cada venda paga entra como **a liberar** e fica **disponível 2 dias depois do fim do evento**.",
        "Vendas da revenda oficial e vendas de teste não geram repasse.",
        "Reembolsos saem do saldo na hora. Se o valor já tinha sido sacado, o saldo fica negativo e é descontado das próximas vendas.",
        "Se você absorve a taxa, os 7,99% já saem do valor líquido.",
      ),
      h("Como sacar"),
      ol(
        "Cadastre a conta de repasse (chave Pix ou conta bancária) em [Painel, Configurações](/painel/configuracoes).",
        "Ligue o app autenticador em [Privacidade e segurança](/conta/seguranca). O banco exige.",
        "No banco, toque em **Criar ou recuperar acesso**: confirme o código do e-mail, o código do app e crie a senha do banco (pelo menos 10 caracteres, com letras e números).",
        "Entre com e-mail, senha do banco e código do app, e peça o saque. O mínimo é **R$ 10**.",
      ),
      p("O dinheiro cai em até 2 dias úteis. Enquanto o pedido estiver em análise, dá para cancelar."),
      warn("Depois de 5 senhas erradas seguidas, o banco fica bloqueado por 15 minutos e avisamos o dono por e-mail."),
    ],
    related: ["taxa-para-produtores"],
  },
  {
    slug: "cancelar-adiar-reembolsar", cat: "produtores",
    title: "Cancelar, adiar ou reembolsar ingressos",
    summary: "No painel do evento, aba Cancelamentos e reembolsos: reembolse pedidos, responda pedidos dos compradores, adie ou cancele o evento.",
    keywords: "reembolsar estornar cancelar evento adiar mudar data devolver dinheiro politica de cancelamento produtor",
    body: [
      p("Tudo fica no painel do evento, na aba **Cancelamentos e reembolsos**. Só o dono e os administradores da equipe têm acesso."),
      ul(
        "**Reembolsar:** busque pelo nome, e-mail, número do pedido ou código do ingresso e reembolse o pedido inteiro ou só alguns ingressos. O comprador recebe o valor pago por eles, **com a taxa de serviço**, e um e-mail com o seu recado.",
        "**Do seu saldo** sai só o líquido que você recebeu pelos ingressos. A taxa é devolvida pela Tickets Win. Se você já sacou, o saldo fica negativo e é descontado das próximas vendas.",
        "**Adiar:** escolha a nova data. Os compradores recebem um e-mail e podem pedir reembolso em até 7 dias; os pedidos aparecem na mesma aba.",
        "**Cancelar o evento:** as vendas param e todos os pedidos pagos são reembolsados automaticamente, com a taxa. Você acompanha quantos já foram e pode tentar de novo os que falharem.",
        "**Política de cancelamento:** além dos 7 dias do direito de arrependimento, você pode deixar o comprador cancelar sozinho até um prazo antes do evento.",
      ),
      p("Os prazos para transferir e revender ficam na aba **Revenda e transferência**."),
    ],
    related: ["financeiro-e-saques", "regras-de-transferencia-e-revenda"],
  },
  {
    slug: "email-marketing", cat: "produtores",
    title: "E-mail marketing para o seu público",
    summary: "Mande campanhas para compradores, seguidores e cadastrados, com modelos prontos, teste e agendamento.",
    keywords: "email marketing campanha newsletter enviar email publico seguidores agendar",
    body: [
      p("Em [Painel, E-mails](/painel/emails) você cria campanhas no visual da Tickets Win:"),
      ul(
        "**Modelo pronto do evento:** escolha o evento e o motivo (novo evento, últimos ingressos, lembrete ou cupom) e, se quiser, escreva um recado.",
        "**Editor:** monte o e-mail do seu jeito e salve como modelo para as próximas.",
      ),
      h("Para quem vai"),
      ul(
        "Compradores de todos os seus eventos ou de eventos escolhidos.",
        "Quem segue a sua página de produtor.",
        "Quem se cadastrou na pré-venda ou no aviso de abertura.",
        "Você pode excluir quem já comprou um evento, para não oferecer de novo.",
      ),
      p("O painel mostra quantas pessoas vão receber, sem repetidos e sem quem pediu para sair da lista. Mande um **teste** para você, depois envie na hora ou **agende** (horário de Brasília)."),
    ],
  },
  {
    slug: "promoters", cat: "produtores",
    title: "Links de promoter e comissão",
    summary: "Crie um link para cada promoter, com comissão de 1% a 50%, e acompanhe as vendas de cada um.",
    keywords: "promoter parceiro link de divulgacao comissao afiliado vendedor",
    body: [
      p("Em [Painel, Promoters](/painel/promoters), crie um link de divulgação para cada parceiro:"),
      ul(
        "Vale para **um evento** ou para **todos** os seus eventos.",
        "Você define a **comissão, de 1% a 50%**, sobre o valor dos ingressos, sem a taxa de serviço.",
        "Quem compra pelo link em até **30 dias** conta para o promoter, mesmo voltando depois. Vale o último link clicado.",
        "Cada promoter tem uma página própria para ver as vendas, sem acesso ao seu painel.",
      ),
      p("O painel mostra pedidos, ingressos, valor vendido e comissão de cada um. A comissão não é descontada do seu repasse automaticamente: o acerto com o promoter é feito por você."),
    ],
  },
  {
    slug: "regras-de-transferencia-e-revenda", cat: "produtores",
    title: "Transferência e revenda no seu evento",
    summary: "Ligue ou desligue a transferência e a revenda oficial, defina o preço máximo e modere os anúncios.",
    keywords: "produtor revenda transferencia preco maximo cambista anuncio moderar",
    body: [
      p("No painel do evento, a aba **Revenda e transferência** controla o que o comprador pode fazer depois da compra:"),
      ul(
        "**Transferência:** o comprador envia o ingresso para outra pessoa pelo e-mail, de graça. O QR muda na hora.",
        "**Revenda oficial:** o comprador anuncia o ingresso na página do evento. Você define o **preço máximo**, em relação ao valor pago. O vendedor recebe o valor anunciado menos 5% e o comprador paga a taxa de serviço normal.",
      ),
      p("Você acompanha os anúncios ativos e pode tirar do ar um anúncio com problema. Se desligar a revenda, os anúncios abertos saem do ar."),
      p("Ingressos já usados na portaria saem da revenda automaticamente."),
      p("Você também define **até quando** dá para transferir e para anunciar ou comprar na revenda (por exemplo, até 24 horas antes do início). O envio do ingresso para outra pessoa na hora da compra vale sempre."),
    ],
    related: ["vender-na-revenda"],
  },
  {
    slug: "cupons-para-produtores", cat: "produtores",
    title: "Criar cupons de desconto",
    summary: "Desconto em % ou em reais, com limite de usos e validade, por evento.",
    keywords: "criar cupom produtor desconto codigo promocional marketing",
    body: [
      p("Crie cupons em [Painel, Marketing](/painel/marketing) ou na criação do evento:"),
      ul(
        "**Código:** de 3 a 40 letras, números, hífen ou sublinhado. Cada código é único na plataforma.",
        "**Desconto:** em porcentagem (até 100%) ou em reais.",
        "**Limite de usos** e **validade** opcionais.",
      ),
      p("Você pode pausar e reativar um cupom a qualquer momento. O painel mostra quantos pedidos usaram cupom e quanto foi dado de desconto."),
      tip("Para divulgar, mande o link do evento com o cupom já aplicado, ou use o motivo **Cupom** nos [e-mails de marketing](/ajuda/email-marketing)."),
    ],
  },
];

export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug) ?? null;
export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug) ?? null;
export const articlesIn = (cat: string) => ARTICLES.filter((a) => a.cat === cat);

/** Artigos relacionados: os indicados primeiro, depois os da mesma categoria. */
export function relatedTo(a: HelpArticle, max = 4): HelpArticle[] {
  const out: HelpArticle[] = [];
  for (const s of a.related ?? []) {
    const r = articleBySlug(s);
    if (r && r.slug !== a.slug) out.push(r);
  }
  for (const r of articlesIn(a.cat)) if (r.slug !== a.slug && !out.includes(r)) out.push(r);
  return out.slice(0, max);
}

/** Mais procurados (página inicial da central). */
export const POPULAR = [
  "pedir-reembolso", "transferir-ingresso", "onde-estao-meus-ingressos", "taxa-de-servico",
  "comprar-meia-entrada", "verificacao-em-duas-etapas",
];

/* ---------- busca (o índice sai daqui; a busca roda no navegador, em ./search) ---------- */

/** Texto puro de um trecho com marcação (**negrito**, [rótulo](/link)). */
export const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

export function articleText(a: HelpArticle) {
  return a.body.map((b) => (b.t === "ul" || b.t === "ol" ? b.x.join(" ") : b.x)).map(plain).join(" ");
}

/** Índice enxuto para a busca no navegador (títulos, resumos e corpo já normalizados). */
export function searchIndex(): SearchDoc[] {
  return ARTICLES.map((a) => ({
    slug: a.slug, cat: a.cat, catTitle: categoryBySlug(a.cat)?.title ?? "", title: a.title, summary: a.summary,
    t: fold(`${a.title} ${a.keywords ?? ""}`), s: fold(a.summary), b: fold(articleText(a)),
  }));
}
