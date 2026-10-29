/* Modelos prontos de campanha para o produtor de eventos. Puro: usado no servidor ao criar a campanha e na tela de escolha. */
import { DEFAULT_AUDIENCE, DEFAULT_STYLE, makeBlock, type Audience, type Block, type Design } from "./design";

export type TemplateKey = "novo" | "ultimos" | "cupom" | "agenda" | "parceiro" | "lembrete" | "pos" | "branco";

export const TEMPLATES: { key: TemplateKey; name: string; desc: string; needsEvent: boolean }[] = [
  { key: "novo", name: "Novo evento", desc: "Anuncie um evento para quem já comprou com você e para quem te segue.", needsEvent: true },
  { key: "ultimos", name: "Últimos ingressos", desc: "Contagem regressiva e os lotes que ainda restam, para quem ainda não comprou.", needsEvent: true },
  { key: "cupom", name: "Cupom exclusivo", desc: "Um código de desconto com o evento ao lado e o botão que já aplica o cupom.", needsEvent: true },
  { key: "lembrete", name: "Lembrete do evento", desc: "Para quem comprou: quanto falta, endereço, como chegar e o que levar.", needsEvent: true },
  { key: "pos", name: "Obrigado por ter vindo", desc: "Depois do evento: agradeça, mostre fotos e chame para a próxima data.", needsEvent: true },
  { key: "agenda", name: "Agenda do mês", desc: "Todos os seus próximos eventos em uma grade, atualizada na hora do envio.", needsEvent: false },
  { key: "parceiro", name: "Evento parceiro", desc: "Indique o evento de outro produtor da Tickets Win para o seu público.", needsEvent: false },
  { key: "branco", name: "Em branco", desc: "Comece do zero com título, texto e botão.", needsEvent: false },
];

const t = (text: string, size: "g" | "m" | "p" = "g"): Block => ({ ...(makeBlock("titulo") as Extract<Block, { t: "titulo" }>), text, size });
const p = (html: string): Block => ({ ...(makeBlock("texto") as Extract<Block, { t: "texto" }>), html });

/** Campanha nova a partir do modelo: nome, assunto, pré-cabeçalho, público e blocos. */
export function fromTemplate(key: TemplateKey, ev: { id: string; title: string } | null, orgName: string, today: string): { name: string; subject: string; preheader: string; audience: Audience; design: Design } {
  const id = ev?.id ?? "";
  const title = ev?.title ?? "o evento";
  const design = (blocks: Block[]): Design => ({ v: 1, style: { ...DEFAULT_STYLE }, blocks });
  const everyone: Audience = { ...DEFAULT_AUDIENCE, excludeBuyersOf: id ? [id] : [] };
  const buyersOf: Audience = { buyers: "events", buyerEvents: id ? [id] : [], followers: false, signups: false, excludeBuyersOf: [] };
  switch (key) {
    case "novo":
      return {
        name: `Novo evento · ${title}`, subject: `{{primeiro_nome|Ei}}, vem aí: ${title}`, preheader: "Ingressos à venda. Os primeiros lotes acabam rápido.", audience: everyone,
        design: design([t(`Vem aí: ${title}`), p(`Oi {{primeiro_nome|pessoal}}, tem evento novo de ${orgName} e você é dos primeiros a saber.<br><br>Os primeiros lotes costumam acabar rápido, então garanta o seu.`), makeBlock("evento", id), makeBlock("lineup", id), makeBlock("ingressos", id), makeBlock("local", id)]),
      };
    case "ultimos":
      return {
        name: `Últimos ingressos · ${title}`, subject: `Últimos ingressos para ${title}`, preheader: "O lote atual está acabando. Depois dele, o preço sobe.", audience: everyone,
        design: design([makeBlock("contagem", id), t(`Últimos ingressos para ${title}`), p("Oi {{primeiro_nome|pessoal}}, o lote atual está quase no fim. Depois dele, o preço sobe.<br><br>Se você ainda não garantiu o seu, a hora é agora."), makeBlock("ingressos", id), makeBlock("evento", id)]),
      };
    case "cupom":
      return {
        name: `Cupom · ${title}`, subject: `{{primeiro_nome|Ei}}, um desconto só pra você`, preheader: `Cupom exclusivo para ${title}.`, audience: everyone,
        design: design([t("Um presente pra você"), p(`Oi {{primeiro_nome|pessoal}}, separamos um cupom de desconto para ${title}. Ele vale por pouco tempo e para poucos ingressos.`), makeBlock("cupom", id), { ...(makeBlock("evento", id) as Extract<Block, { t: "evento" }>), layout: "lado" }]),
      };
    case "lembrete":
      return {
        name: `Lembrete · ${title}`, subject: `Falta pouco para ${title}`, preheader: "Endereço, horário e tudo o que você precisa saber.", audience: buyersOf,
        design: design([makeBlock("contagem", id), t("Falta pouco!"), p("Oi {{primeiro_nome|pessoal}}, tá chegando. Separamos o que você precisa saber:<br><br><b>Ingresso:</b> está em Meus ingressos, na Tickets Win. Dá para colocar na Apple Wallet ou no Google Wallet.<br><b>Documento:</b> leve um documento com foto. Quem comprou meia-entrada precisa do comprovante."), makeBlock("local", id), { ...(makeBlock("botao") as Extract<Block, { t: "botao" }>), label: "Ver meus ingressos", href: "/meus-ingressos" }]),
      };
    case "pos":
      return {
        name: `Obrigado · ${title}`, subject: `Obrigado por ter vindo, {{primeiro_nome|pessoal}}`, preheader: "Foi incrível. E já tem a próxima.", audience: buyersOf,
        design: design([t(`Obrigado por fazer parte de ${title}`), p("Oi {{primeiro_nome|pessoal}}, obrigado por ter vindo. Foi uma noite incrível e você fez parte dela."), makeBlock("imagem"), p("Já estamos preparando as próximas datas. Olha o que vem por aí:"), { ...(makeBlock("eventos") as Extract<Block, { t: "eventos" }>), limit: 2, title: "" }, makeBlock("redes")]),
      };
    case "agenda":
      return {
        name: `Agenda · ${today}`, subject: `A agenda de ${orgName}`, preheader: "Todos os próximos eventos em um lugar.", audience: DEFAULT_AUDIENCE,
        design: design([t("A nossa agenda"), p("Oi {{primeiro_nome|pessoal}}, estes são os próximos eventos. Escolha o seu e chame a galera."), { ...(makeBlock("eventos") as Extract<Block, { t: "eventos" }>), limit: 6, title: "" }, makeBlock("redes")]),
      };
    case "parceiro":
      return {
        name: `Evento parceiro · ${today}`, subject: "Uma indicação da casa", preheader: "Um evento de amigos que a gente recomenda.", audience: DEFAULT_AUDIENCE,
        design: design([t("Indicação da casa"), p(`Oi {{primeiro_nome|pessoal}}, esse é de parceiros de ${orgName} e a gente recomenda de olhos fechados.`), makeBlock("evento", ""), makeBlock("redes")]),
      };
    case "branco":
      return {
        name: `Nova campanha · ${today}`, subject: "", preheader: "", audience: DEFAULT_AUDIENCE,
        design: design([t("Escreva um título"), p("Oi {{primeiro_nome|pessoal}}, escreva aqui a sua mensagem."), { ...(makeBlock("botao") as Extract<Block, { t: "botao" }>), href: "" }]),
      };
  }
}
