import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailEnabled, sendEmails, sendTx, siteBase, type Mail } from "@/lib/email";
import { brl, dateNice, parts } from "@/lib/format";
import { renderTx, type TxBlock } from "@/lib/mail/tx";
import { sellerNet } from "@/lib/resale";
import { eventLabels } from "@/lib/tickets/labels";
import { companionsLabel, guestQrPngPath } from "@/lib/guest-list";
import { createResetLink } from "@/lib/password-link";
import { formatPhone } from "@/lib/phone";
import { wideArt } from "@/lib/event-art";

/*
 * Todos os e-mails transacionais da Tickets Win: conta (código, boas-vindas, senha), compra,
 * transferência, revenda, grupo, equipe, lista de espera, evento publicado e lembrete.
 * Cada função falha sozinha (registra no log) para nunca derrubar a ação que a chamou.
 */

const { orders, tickets, ticketTransfers, events, userProfiles, organizers, groupShares } = schema;

const firstName = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";
const hello = (n?: string | null) => (firstName(n) ? `Oi, ${firstName(n)}!` : "Oi!");
const safe = <A extends unknown[]>(name: string, fn: (...a: A) => Promise<unknown>) => async (...a: A) => {
  if (!emailEnabled()) return;
  try { await fn(...a); } catch (e) { console.error("notify", name, e); }
};

/** E-mail e nome de um usuário: tabela de login do Neon Auth, com o perfil como reserva. */
export async function userContact(userId: string): Promise<{ email: string; name: string } | null> {
  try {
    const r = await db.execute<{ email: string; name: string | null }>(sql`select email, name from neon_auth."user" where id = ${userId} limit 1`);
    const u = r.rows[0];
    if (u?.email) return { email: u.email, name: u.name ?? "" };
  } catch { /* banco sem o schema do Neon Auth (ramo de dev) */ }
  const p = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId), columns: { email: true, name: true } });
  return p?.email ? { email: p.email, name: p.name ?? "" } : null;
}

type EvRow = typeof events.$inferSelect & { venue: (typeof schema.venues.$inferSelect & { city: typeof schema.cities.$inferSelect }) | null };
const eventWith = { venue: { with: { city: true } } } as const;
/** Arte horizontal do cartão do evento (só cartaz: o banner montado com ele, DM-2). */
const banner = (e: EvRow) => wideArt(e);

function eventBlock(e: EvRow): TxBlock {
  const L = eventLabels(e);
  return { kind: "event", title: e.title, when: L.dateFull + (L.doors ? ` · ${L.doors}` : ""), where: [L.venue, L.addr].filter(Boolean).join(" · "), image: banner(e), url: `/eventos/${e.slug}` };
}
function mapsUrl(e: EvRow) {
  const L = eventLabels(e);
  const q = [L.venue, e.venue?.address ?? L.addr].filter(Boolean).join(", ");
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}${e.venue?.placeId ? `&query_place_id=${encodeURIComponent(e.venue.placeId)}` : ""}`;
}

/* ============================== conta ============================== */

type OtpType = "email-verification" | "forget-password" | "sign-in" | "change-email";

/** Código de 6 dígitos do Neon Auth (ativar conta, redefinir senha ou entrar sem senha). */
export async function mailAuthCode(type: OtpType, email: string, code: string, name?: string | null) {
  const e = encodeURIComponent(email);
  if (type === "forget-password") {
    const url = await createResetLink(email, code);
    return sendTx(email, "Crie sua nova senha na Tickets Win", {
      preheader: "Toque no botão para criar uma senha nova. O link vale por 15 minutos.",
      title: "Criar nova senha", paragraphs: [`${hello(name)} Recebemos um pedido para trocar a senha da sua conta na Tickets Win. Toque no botão para escolher a nova senha.`],
      cta: { label: "Criar nova senha", url },
      blocks: [{ kind: "note", text: "O link vale por 15 minutos e funciona uma vez só. Não encaminhe este e-mail." }],
      foot: "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
    });
  }
  if (type === "email-verification") {
    return sendTx(email, `${code} é o código para ativar sua conta`, {
      preheader: "Confirme seu e-mail para ativar a conta na Tickets Win.",
      eyebrow: "Bem-vindo à Tickets Win", title: "Ative sua conta",
      paragraphs: [`${hello(name)} Falta só confirmar que este e-mail é seu. Digite o código no site ou toque no botão.`],
      blocks: [{ kind: "code", code, note: "Vale por poucos minutos." }],
      cta: { label: "Ativar minha conta", url: `/ativar-conta?email=${e}` },
      foot: "Se você não criou uma conta, ignore este e-mail.",
    });
  }
  if (type === "change-email") {
    return sendTx(email, `${code} é o código para confirmar seu novo e-mail`, {
      preheader: "Confirme o novo e-mail da sua conta na Tickets Win.",
      title: "Confirme seu novo e-mail", paragraphs: [`${hello(name)} Use o código abaixo para passar a usar este e-mail na sua conta.`],
      blocks: [{ kind: "code", code, note: "Vale por poucos minutos. Não compartilhe com ninguém." }],
      foot: "Se você não pediu esta troca, ignore este e-mail.",
    });
  }
  return sendTx(email, `${code} é o seu código de acesso`, {
    preheader: "Use este código para entrar na Tickets Win.",
    title: "Seu código de acesso", paragraphs: [`${hello(name)} Use o código abaixo para entrar na sua conta.`],
    blocks: [{ kind: "code", code, note: "Vale por poucos minutos. Não compartilhe com ninguém." }],
    foot: "Se não foi você, ignore este e-mail.",
  });
}

/** Link mágico do Neon Auth (ativação, redefinição de senha ou entrada). */
export async function mailAuthLink(type: OtpType, email: string, url: string) {
  const t = type === "forget-password"
    ? { subject: "Redefinir sua senha", title: "Redefinir sua senha", p: "Toque no botão para criar uma senha nova.", cta: "Criar nova senha" }
    : type === "email-verification"
      ? { subject: "Ative sua conta na Tickets Win", title: "Ative sua conta", p: "Toque no botão para confirmar que este e-mail é seu.", cta: "Ativar minha conta" }
      : { subject: "Seu link de acesso", title: "Entrar na Tickets Win", p: "Toque no botão para entrar na sua conta.", cta: "Entrar" };
  return sendTx(email, t.subject, { preheader: t.p, title: t.title, paragraphs: [t.p], cta: { label: t.cta, url }, foot: "O link vale por pouco tempo. Se não foi você, ignore este e-mail." });
}

export const mailWelcome = safe("welcome", async (email: string, name?: string | null) => {
  await sendTx(email, "Bem-vindo à Tickets Win", {
    preheader: "Sua conta está pronta. Bora achar o próximo rolê?",
    eyebrow: "Conta criada", title: "Bem-vindo à Tickets Win",
    paragraphs: [`${hello(name)} Sua conta está pronta. Seus ingressos ficam em Meus ingressos, com QR code no celular e na carteira do celular.`],
    cta: { label: "Explorar eventos", url: "/explorar" },
  });
});

export const mailPasswordChanged = safe("password", async (email: string) => {
  await sendTx(email, "Sua senha foi alterada", {
    preheader: "A senha da sua conta na Tickets Win acabou de mudar.",
    title: "Sua senha foi alterada", paragraphs: ["A senha da sua conta na Tickets Win acabou de ser trocada. Se foi você, está tudo certo."],
    blocks: [{ kind: "note", text: "Não reconhece esta mudança? Redefina a senha agora e fale com a gente pela Ajuda." }],
    cta: { label: "Criar outra senha", url: "/esqueci-senha" },
    link: { label: "Falar com a Ajuda", url: "/ajuda" },
  });
});

const MFA_COPY: Record<"login" | "setup" | "off" | "email" | "newemail" | "bank", { subject: string; title: string; p: string }> = {
  bank: { subject: "é o seu código para entrar no Banco Tickets Win", title: "Entrar no Banco Tickets Win", p: "Alguém (provavelmente você) digitou a senha do Banco Tickets Win. Para abrir o extrato e pedir saques, use o código abaixo." },
  login: { subject: "é o seu código para entrar", title: "Confirme que é você", p: "Alguém (provavelmente você) acabou de entrar na sua conta com a senha. Para concluir o acesso, use o código abaixo." },
  setup: { subject: "é o código para ativar a verificação em duas etapas", title: "Ative a verificação em duas etapas", p: "Use o código abaixo para ligar a proteção extra da sua conta." },
  off: { subject: "é o código para desligar a verificação em duas etapas", title: "Desligar a verificação em duas etapas", p: "Use o código abaixo para confirmar que quer desligar a proteção extra da conta." },
  newemail: { subject: "é o código para confirmar seu novo e-mail", title: "Confirme seu novo e-mail", p: "Este e-mail vai passar a ser o de acesso da sua conta na Tickets Win. Para confirmar, use o código abaixo." },
  email: { subject: "é o código para trocar o e-mail da conta", title: "Trocar o e-mail da conta", p: "Alguém (provavelmente você) pediu para trocar o e-mail de acesso da sua conta na Tickets Win. Para autorizar, use o código abaixo." },
};

/** Código da verificação em duas etapas (entrar, ligar/desligar a proteção, trocar e-mail). Devolve se saiu. */
export async function mailMfaCode(email: string, code: string, purpose: keyof typeof MFA_COPY, name?: string | null): Promise<boolean> {
  if (!emailEnabled()) {
    if (process.env.NODE_ENV !== "production") { console.log(`[dev] código ${purpose} para ${email}: ${code}`); return true; }
    return false;
  }
  const t = MFA_COPY[purpose];
  return sendTx(email, `${code} ${t.subject}`, {
    preheader: t.p, title: t.title, paragraphs: [`${hello(name)} ${t.p}`],
    blocks: [{ kind: "code", code, note: "Vale por 10 minutos. Ninguém da Tickets Win vai pedir este código." }],
    foot: purpose === "login" ? "Não foi você? Troque sua senha agora: alguém pode ter descoberto." : "Se não foi você, ignore este e-mail e troque sua senha.",
  });
}

/** Aviso de mudança de segurança na conta (duas etapas, e-mail, senha). */
export const mailSecurityNotice = safe("security", async (email: string, title: string, text: string) => {
  await sendTx(email, title, {
    preheader: text, title, paragraphs: [text],
    blocks: [{ kind: "note", text: "Não reconhece esta mudança? Redefina a senha agora e fale com a gente pela Ajuda." }],
    cta: { label: "Ver segurança da conta", url: "/conta/seguranca" },
    link: { label: "Falar com a Ajuda", url: "/ajuda" },
  });
});

/** Pedido de saque: confirmação para o produtor e aviso para o financeiro fazer o repasse. */
export const mailPayoutRequested = safe("payout", async (to: string, name: string, amount: number, dest: string, id: string) => {
  await sendTx(to, `Pedido de saque de ${brl(amount)} recebido`, {
    preheader: `Seu saque de ${brl(amount)} está em análise.`,
    eyebrow: "Banco Tickets Win", title: "Pedido de saque recebido",
    paragraphs: [`${hello(name)} Recebemos seu pedido de saque de ${brl(amount)}. O dinheiro cai em até 2 dias úteis em ${dest}.`],
    blocks: [{ kind: "note", text: "Não pediu este saque? Entre no Banco Tickets Win, cancele o pedido e troque a senha do banco em “Criar ou recuperar acesso”." }],
  });
  const fin = process.env.FINANCE_EMAIL || "info@ticketswin.com.br";
  await sendTx(fin, `Saque pedido: ${brl(amount)} · ${name || to}`, {
    preheader: `Repassar ${brl(amount)} para ${dest}.`, title: "Novo pedido de saque",
    paragraphs: [`${name || "Produtor"} (${to}) pediu um saque de ${brl(amount)} para ${dest}.`, `Pedido ${id}. Atualize o status em payout_requests quando o repasse sair.`],
  });
});

/* ============================== inscrição de produtor ============================== */

type Application = typeof schema.producerApplications.$inferSelect;
const TEAM = () => process.env.PRODUCER_APPROVAL_EMAIL || "lucas@ticketswin.com.br";

/** Inscrição recebida: confirmação para a pessoa e ficha completa para a equipe aprovar. */
export const mailApplicationReceived = safe("app-received", async (a: Application) => {
  await sendTx(a.email, "Recebemos sua inscrição de produtor", {
    preheader: "Respondemos no mesmo dia útil.",
    eyebrow: "Tickets Win para produtores", title: "Inscrição recebida",
    paragraphs: [`${hello(a.firstName)} Recebemos sua inscrição para criar eventos na Tickets Win. A gente analisa e responde no mesmo dia útil, por e-mail.`, "Assim que for aprovada, você recebe o link para montar sua página de produtor e criar o primeiro evento."],
    cta: { label: "Ver minha inscrição", url: "/criar-evento" },
  });
  const rows: [string, string][] = [
    ["Nome", `${a.firstName} ${a.lastName}`], ["E-mail", a.email], ["Telefone", formatPhone(a.phone)], ["Produtora", a.company || "—"],
    ["Cidade", `${a.city} – ${a.uf}`], ["Categoria", a.category], ["Ticket médio", brl(a.avgTicketCents)], ["Público esperado", a.expected.toLocaleString("pt-BR")],
    ["Público-alvo", a.audience], ["Como chegou", a.source], ["Instagram", a.instagram || "—"],
  ];
  await sendTx(TEAM(), `Nova inscrição de produtor: ${a.company || `${a.firstName} ${a.lastName}`}`, {
    preheader: `${a.city} – ${a.uf} · ${a.category} · ${a.expected} pessoas`,
    eyebrow: "Central Tickets Win", title: "Nova inscrição de produtor",
    paragraphs: [`${a.firstName} ${a.lastName} quer criar eventos na Tickets Win.`],
    blocks: [{ kind: "rows", rows }],
    cta: { label: "Aprovar ou recusar", url: "/tw-central?aba=inscricoes" },
  });
});

export const mailApplicationApproved = safe("app-approved", async (a: Application) => {
  await sendTx(a.email, "Sua conta de produtor foi aprovada", {
    preheader: "Monte sua página de produtor e crie o primeiro evento.",
    eyebrow: "Bem-vindo, produtor", title: "Inscrição aprovada",
    paragraphs: [`${hello(a.firstName)} Sua inscrição foi aprovada. Agora é só montar sua página de produtor (leva um minuto) e criar o primeiro evento.`],
    cta: { label: "Montar minha página", url: "/produtores/cadastro" },
  });
});

/** A equipe liberou a conta como produtor pela central (sem a pessoa ter se inscrito, ou aprovando a inscrição dela). */
export const mailProducerAuthorized = safe("producer-authorized", async (a: Application) => {
  await sendTx(a.email, "Você foi autorizado como produtor na Tickets Win", {
    preheader: "Crie sua conta de produtor e comece a vender ingressos.",
    eyebrow: "Bem-vindo, produtor", title: "Você foi autorizado como produtor",
    paragraphs: [
      `${hello(a.firstName)} A equipe da Tickets Win autorizou sua conta como produtor. Agora você já pode criar sua conta de produtor (leva um minuto) e publicar o primeiro evento.`,
      "Entre com este mesmo e-mail para continuar.",
    ],
    cta: { label: "Criar minha conta de produtor", url: "/produtores/cadastro" },
  });
});

export const mailApplicationRejected =safe("app-rejected", async (a: Application, note: string | null) => {
  await sendTx(a.email, "Sobre sua inscrição de produtor", {
    preheader: "Veja o retorno da equipe da Tickets Win.",
    title: "Sua inscrição não foi aprovada agora",
    paragraphs: [`${hello(a.firstName)} Analisamos sua inscrição e, por enquanto, não conseguimos liberar a criação de eventos.`, ...(note ? [note] : []), "Se quiser conversar, é só responder este e-mail ou falar com a gente pela Ajuda."],
    link: { label: "Falar com a Ajuda", url: "/ajuda" },
  });
});

/** Saque mudou de status no financeiro (processando, pago, recusado). */
export const mailPayoutUpdated = safe("payout-updated", async (userId: string, amount: number, status: string, note: string | null) => {
  const c = await userContact(userId);
  if (!c) return;
  const t = status === "paid"
    ? { s: `Saque de ${brl(amount)} pago`, h: "Saque pago", p: `O saque de ${brl(amount)} foi pago. Ele cai na sua conta conforme o horário do banco.` }
    : status === "processing"
      ? { s: `Saque de ${brl(amount)} em processamento`, h: "Saque em processamento", p: `Estamos fazendo o repasse de ${brl(amount)}. Avisamos quando for pago.` }
      : { s: `Saque de ${brl(amount)} recusado`, h: "Saque recusado", p: `Não conseguimos fazer o repasse de ${brl(amount)}. O valor voltou para o seu saldo no Banco Tickets Win.` };
  await sendTx(c.email, t.s, { preheader: t.p, eyebrow: "Banco Tickets Win", title: t.h, paragraphs: [`${hello(c.name)} ${t.p}`, ...(note ? [note] : [])] });
});

/* ============================== compra ============================== */

const METHOD: Record<string, string> = { pix: "Pix", card: "Cartão de crédito", free: "Grátis", test: "Teste" };

/** Pedido pago: ingressos, evento, valores e o caminho até o QR code. */
export const mailOrderConfirmed = safe("order", async (orderId: string) => {
  const o = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { event: { with: eventWith }, tickets: { with: { ticketType: { with: { session: true } } } } },
  });
  if (!o || o.status !== "paid" || !o.tickets.length) return;
  const to = o.buyerEmail || (await userContact(o.userId ?? ""))?.email;
  if (!to) return;
  const e = o.event as EvRow;
  const free = o.totalCents === 0;
  const resale = !!o.resaleListingId;
  const n = o.tickets.length;
  // ingressos de outras pessoas: foram por e-mail para cada uma (ficam com quem comprou até a pessoa aceitar)
  const gifts = await db.query.ticketTransfers.findMany({
    where: and(inArray(ticketTransfers.ticketId, o.tickets.map((t) => t.id)), eq(ticketTransfers.kind, "gift")),
    columns: { ticketId: true, toEmail: true },
  });
  const sentTo = new Map(gifts.map((g) => [g.ticketId, g.toEmail]));
  const mine = n - sentTo.size;
  const items = o.tickets.map((t) => ({
    name: t.ticketType.name + (t.halfPrice ? " · meia" : ""),
    sub: [
      sentTo.has(t.id) ? `Enviado para ${t.holderName ? `${t.holderName} (${sentTo.get(t.id)})` : sentTo.get(t.id)}` : t.holderName && `Titular: ${t.holderName}`,
      t.ticketType.session ? dateNice(t.ticketType.session.startAt) : null,
    ].filter(Boolean).join(" · "),
    right: t.code,
  }));
  const sentNote: TxBlock[] = sentTo.size ? [{
    kind: "note",
    text: `${sentTo.size === 1 ? "1 ingresso foi enviado" : `${sentTo.size} ingressos foram enviados`} por e-mail para quem vai usar (${[...new Set(sentTo.values())].join(", ")}). Cada pessoa precisa entrar ou criar uma conta com o e-mail informado e aceitar o ingresso. Enquanto ninguém aceitar, você pode reenviar ou cancelar em Meus ingressos.`,
  }] : [];
  const rows: [string, string][] = [["Pedido", `nº ${o.number ?? "—"}`]];
  if (!free) rows.push(["Pagamento", o.paymentMethod === "card" && o.installments > 1 ? `Cartão em ${o.installments}x` : METHOD[o.paymentMethod ?? "pix"] ?? "Pix"]);
  if (!free && o.feeCents) rows.push(["Taxa de serviço", brl(o.feeCents)]);
  rows.push(["Total", free ? "Grátis" : brl(o.totalCents)]);
  const maps = mapsUrl(e);
  await sendTx(to, resale ? `Seu ingresso da revenda: ${e.title}` : free ? `Ingresso garantido: ${e.title}` : `Compra confirmada: ${e.title}`, {
    preheader: `${n} ${n === 1 ? "ingresso" : "ingressos"} para ${e.title}. O QR code já está em Meus ingressos.`,
    eyebrow: `Pedido nº ${o.number ?? ""}`.trim(),
    title: resale ? "O ingresso é seu" : free ? "Ingresso garantido!" : "Compra confirmada!",
    paragraphs: [`${hello(o.buyerName)} ${resale ? "Você comprou um ingresso na revenda oficial. O QR code anterior foi cancelado e um novo já é seu." : n === 1 ? "Seu ingresso está garantido." : `Seus ${n} ingressos estão garantidos.`} ${mine ? "Mostre o QR code na entrada: ele fica em Meus ingressos e pode ir para a carteira do celular." : "Cada pessoa recebe o próprio ingresso por e-mail."}`],
    blocks: [eventBlock(e), { kind: "items", title: n === 1 ? "Seu ingresso" : "Seus ingressos", items }, ...sentNote, { kind: "rows", rows }, { kind: "note", text: "Não tire print do QR code para mandar a outras pessoas: ele muda quando o ingresso é transferido. Para passar o ingresso, use Transferir em Meus ingressos." }],
    cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
    ...(maps ? { link: { label: "Como chegar", url: maps } } : {}),
    reason: "Você recebeu este e-mail porque fez um pedido na Tickets Win.",
  });
});

/** Pagamento estornado: o pedido não pôde ser concluído (ou foi reembolsado) e o valor volta para quem pagou. */
export const mailOrderRefunded = safe("refund", async (orderId: string, reason: string, amountCents?: number) => {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { event: { columns: { title: true, slug: true } } } });
  if (!o) return;
  const to = o.buyerEmail || (await userContact(o.userId ?? ""))?.email;
  if (!to) return;
  const amount = amountCents ?? o.totalCents;
  const how = o.paymentMethod === "card"
    ? "No cartão, o estorno aparece em até 2 faturas, dependendo do banco."
    : "No Pix, o valor volta para a conta de onde saiu, normalmente em minutos (pode levar alguns dias).";
  await sendTx(to, `Pagamento estornado: ${o.event.title}`, {
    preheader: `Estornamos ${brl(amount)} do pedido nº ${o.number ?? ""}.`,
    eyebrow: `Pedido nº ${o.number ?? ""}`.trim(),
    title: "Pagamento estornado",
    paragraphs: [`${hello(o.buyerName)} ${reason}`, `Estornamos ${brl(amount)} para o mesmo meio de pagamento. ${how}`],
    blocks: [{ kind: "rows", rows: [["Evento", o.event.title], ["Pedido", `nº ${o.number ?? "—"}`], ["Valor estornado", brl(amount)]] }],
    cta: { label: "Ver o evento", url: `/eventos/${o.event.slug}` },
    reason: "Você recebeu este e-mail porque fez um pedido na Tickets Win.",
  });
});

/** Revenda: o vendedor fica sabendo que o ingresso foi vendido e quanto recebe. */
export const mailResaleSold = safe("resale", async (sellerUserId: string, eventTitle: string, priceCents: number) => {
  const c = await userContact(sellerUserId);
  if (!c) return;
  await sendTx(c.email, `Seu ingresso de ${eventTitle} foi vendido`, {
    preheader: "Revenda concluída.",
    eyebrow: "Revenda oficial", title: "Seu ingresso foi vendido",
    paragraphs: [`${hello(c.name)} Alguém comprou o seu ingresso de ${eventTitle} na revenda oficial. O QR code antigo deixou de valer.`],
    blocks: [{ kind: "rows", rows: [["Preço anunciado", brl(priceCents)], ["Taxa da revenda (5%)", `− ${brl(priceCents - sellerNet(priceCents))}`], ["Você recebe", brl(sellerNet(priceCents))]] }],
    cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
    reason: "Você recebeu este e-mail porque anunciou um ingresso na revenda da Tickets Win.",
  });
});

/** Grupo: quem montou o grupo acompanha cada amigo que paga. */
export const mailGroupSharePaid = safe("group", async (shareId: string) => {
  const sh = await db.query.groupShares.findFirst({ where: eq(groupShares.id, shareId), with: { group: { with: { event: { columns: { title: true } } } } } });
  if (!sh?.group || sh.userId === sh.group.leaderUserId) return;
  const leader = await userContact(sh.group.leaderUserId);
  if (!leader) return;
  const left = await db.select({ n: sql<number>`count(*)::int` }).from(groupShares).where(and(eq(groupShares.groupId, sh.groupId), isNull(groupShares.paidAt)));
  const n = left[0]?.n ?? 0;
  const who = firstName(sh.name) || "Um amigo";
  await sendTx(leader.email, n ? `${who} pagou a parte do grupo` : `Grupo completo: ${sh.group.event.title}`, {
    preheader: n ? `Faltam ${n} ${n === 1 ? "parte" : "partes"} para fechar o grupo.` : "Todo mundo pagou. O grupo está fechado.",
    eyebrow: sh.group.event.title, title: n ? `${who} pagou a parte` : "Grupo completo!",
    paragraphs: [n ? `Faltam ${n} ${n === 1 ? "parte" : "partes"}. Lembre a galera: as vagas ficam guardadas só até o prazo do grupo.` : "Todo mundo pagou a sua parte. Cada pessoa recebeu o próprio ingresso."],
    cta: { label: "Ver o grupo", url: `/grupo/${sh.group.code}` },
    reason: "Você recebeu este e-mail porque montou um grupo na Tickets Win.",
  });
});

/* ============================== transferência ============================== */

async function transferData(transferId: string) {
  const tr = await db.query.ticketTransfers.findFirst({ where: eq(ticketTransfers.id, transferId) });
  if (!tr) return null;
  const t = await db.query.tickets.findFirst({ where: eq(tickets.id, tr.ticketId), with: { event: { with: eventWith }, ticketType: { columns: { name: true } } } });
  if (!t) return null;
  return { tr, t, e: t.event as EvRow, from: await userContact(tr.fromUserId) };
}

/**
 * Quem recebe ganha o link para aceitar; quem enviou recebe a confirmação (só na transferência: no ingresso de
 * outra pessoa enviado na compra, o e-mail do pedido já conta para quem foi). `resend`: só o e-mail de quem recebe.
 */
export const mailTransferSent = safe("transfer", async (transferId: string, resend = false) => {
  const x = await transferData(transferId);
  if (!x) return;
  const gift = x.tr.kind === "gift";
  let fromName = x.from?.name || "Alguém";
  if (gift) {
    // na compra vale o nome que a pessoa informou no pedido
    const o = await db.query.orders.findFirst({ where: eq(orders.id, x.t.orderId), columns: { buyerName: true } });
    fromName = o?.buyerName || fromName;
  }
  const first = firstName(fromName) || fromName;
  const ticket: TxBlock = { kind: "items", items: [{ name: x.t.ticketType.name + (x.t.halfPrice ? " · meia" : ""), sub: gift && x.t.holderName ? `Titular: ${x.t.holderName}` : "Ingresso digital com QR code" }] };
  const mails: Mail[] = [{
    to: x.tr.toEmail,
    subject: gift ? `${first} te mandou um ingresso para ${x.e.title}` : `${first} te enviou um ingresso para ${x.e.title}`,
    ...renderTx(gift ? {
      preheader: "Entre ou crie sua conta com este e-mail e aceite para o ingresso ficar com você.",
      eyebrow: "Ingresso para você", title: `${first} te mandou um ingresso`,
      paragraphs: [
        `${hello(x.t.holderName)} ${fromName} comprou um ingresso de ${x.e.title} para você.`,
        "Para ficar com ele, toque no botão, entre na sua conta (ou crie uma, é grátis) com este e-mail e aceite. O ingresso aparece em Meus ingressos com um QR code só seu.",
      ],
      blocks: [eventBlock(x.e), ticket, { kind: "note", text: `O ingresso é nominal: leve um documento com foto. Use a conta do e-mail ${x.tr.toEmail}, é só ela que pode receber este ingresso.` }],
      cta: { label: "Receber meu ingresso", url: `/transferencia/${x.tr.token}` },
      reason: `Você recebeu este e-mail porque ${fromName} comprou um ingresso para ${x.tr.toEmail} na Tickets Win.`,
    } : {
      preheader: "Aceite para o ingresso ir para a sua conta.",
      eyebrow: "Ingresso recebido", title: `${first} te enviou um ingresso`,
      paragraphs: [`${fromName} transferiu um ingresso de ${x.e.title} para este e-mail. Aceite para ele aparecer em Meus ingressos com um QR code novo, só seu.`],
      blocks: [eventBlock(x.e), ticket, { kind: "note", text: "Se você ainda não tem conta, crie com este mesmo e-mail. É grátis." }],
      cta: { label: "Aceitar ingresso", url: `/transferencia/${x.tr.token}` },
      reason: `Você recebeu este e-mail porque ${fromName} transferiu um ingresso para ${x.tr.toEmail} na Tickets Win.`,
    }, siteBase()),
  }];
  if (x.from && !gift && !resend) mails.push({
    to: x.from.email,
    subject: `Transferência enviada: ${x.e.title}`,
    ...renderTx({
      preheader: `Enviamos o ingresso para ${x.tr.toEmail}.`,
      eyebrow: x.e.title, title: "Transferência enviada",
      paragraphs: [`Enviamos o seu ingresso para ${x.tr.toEmail}. O QR code que estava com você já não vale mais.`, "Avisamos quando a pessoa aceitar. Enquanto ela não aceitar, você pode cancelar e o ingresso volta para você."],
      blocks: [ticket],
      cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
      reason: "Você recebeu este e-mail porque transferiu um ingresso na Tickets Win.",
    }, siteBase()),
  });
  await sendEmails(mails);
});

export const mailTransferAccepted = safe("transfer-ok", async (transferId: string) => {
  const x = await transferData(transferId);
  if (!x?.from) return;
  const to = (x.tr.toUserId && (await userContact(x.tr.toUserId))?.name) || x.tr.toEmail;
  const gift = x.tr.kind === "gift";
  await sendTx(x.from.email, gift ? `${firstName(to) || to} recebeu o ingresso de ${x.e.title}` : `${firstName(to) || to} aceitou o seu ingresso`, {
    preheader: `O ingresso de ${x.e.title} agora está na conta de ${to}.`,
    eyebrow: x.e.title, title: gift ? "Ingresso recebido" : "Transferência concluída",
    paragraphs: [`${to} aceitou o ingresso de ${x.e.title}. Agora ele está na conta dessa pessoa, com um QR code novo.`],
    cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
    reason: "Você recebeu este e-mail porque transferiu um ingresso na Tickets Win.",
  });
});

/** Quem recebeu fica sabendo que a transferência foi cancelada por quem enviou. */
export const mailTransferCancelled = safe("transfer-x", async (transferId: string) => {
  const x = await transferData(transferId);
  if (!x) return;
  const gift = x.tr.kind === "gift";
  await sendTx(x.tr.toEmail, gift ? `Envio cancelado: ${x.e.title}` : `Transferência cancelada: ${x.e.title}`, {
    preheader: "O ingresso voltou para quem enviou.",
    title: gift ? "Envio do ingresso cancelado" : "Transferência cancelada",
    paragraphs: [`${x.from?.name || "Quem enviou"} cancelou ${gift ? "o envio" : "a transferência"} do ingresso de ${x.e.title}. O link que você recebeu não vale mais.`],
    cta: { label: "Ver o evento", url: `/eventos/${x.e.slug}` },
    reason: `Você recebeu este e-mail porque um ingresso foi transferido para ${x.tr.toEmail} na Tickets Win.`,
  });
});

/* ============================== produtor ============================== */

const ROLE_LABEL: Record<string, string> = { admin: "Admin (vê vendas e edita eventos)", portaria: "Portaria (faz o check-in na entrada)" };

export const mailTeamInvite = safe("team", async (email: string, role: string, orgName: string, inviter?: string | null) => {
  await sendTx(email, `Convite para a equipe de ${orgName}`, {
    preheader: `${inviter || orgName} chamou você para a equipe na Tickets Win.`,
    eyebrow: "Convite de equipe", title: `Entre para a equipe de ${orgName}`,
    paragraphs: role === "portaria"
      ? [`${inviter || orgName} adicionou este e-mail à equipe de ${orgName} na Tickets Win para fazer o check-in na entrada dos eventos.`,
        "Entre (ou crie a conta) com este mesmo e-mail pelo celular. Na tela de Check-in, toque em “Abrir app da portaria” no evento: o seu acesso é criado na hora e a câmera já abre para ler os QR codes dos ingressos."]
      : [`${inviter || orgName} adicionou este e-mail à equipe de ${orgName} na Tickets Win.`, "Entre (ou crie a conta) com este mesmo e-mail e o painel do produtor já abre com o seu acesso."],
    blocks: [
      { kind: "rows", rows: [["Produtor", orgName], ["Função", ROLE_LABEL[role] ?? role]] },
      ...(role === "portaria" ? [{ kind: "note" as const, text: "Dica: no celular, depois de abrir o app da portaria, use “Adicionar à tela de início” para abrir como um aplicativo no dia do evento." }] : []),
    ],
    cta: role === "portaria" ? { label: "Abrir o check-in", url: "/painel/equipe" } : { label: "Abrir o painel", url: "/painel" },
    reason: `Você recebeu este e-mail porque ${orgName} convidou ${email} para a equipe na Tickets Win.`,
  });
});

/** Acesso de portaria de um evento: link único e secreto que abre o app da portaria já conectado. */
export async function mailPortariaAccess(x: { email: string; name: string; eventTitle: string; when: string; orgName: string; token: string; code: string }): Promise<boolean> {
  if (!emailEnabled()) return false;
  return sendTx(x.email, `Seu acesso à portaria: ${x.eventTitle}`, {
    preheader: `Abra no celular para fazer o check-in de ${x.eventTitle}.`,
    eyebrow: "Check-in do evento", title: "Seu acesso à portaria",
    paragraphs: [
      `${x.name ? `Oi, ${x.name.split(" ")[0]}! ` : ""}${x.orgName} liberou você para fazer o check-in na entrada de ${x.eventTitle}${x.when ? ` (${x.when})` : ""}.`,
      "Abra o botão abaixo no celular: o app da portaria já entra conectado ao evento e a câmera lê o QR code dos ingressos. Dá para adicionar à tela de início, como um aplicativo.",
    ],
    blocks: [
      { kind: "code", code: x.code, note: "Se preferir, abra ticketswin.com.br/portaria e digite este código." },
      { kind: "note", text: "Este link é só seu e pessoal: não encaminhe. Quem organiza o evento vê quando ele é usado e pode desligá-lo a qualquer momento." },
    ],
    cta: { label: "Abrir o app da portaria", url: `/portaria/entrar/${x.token}` },
    reason: `Você recebeu este e-mail porque ${x.orgName} criou um acesso de portaria para ${x.email} na Tickets Win.`,
  }).catch(() => false);
}

/** Ingresso de lista (lista free): o próprio ingresso no e-mail (QR em PNG), com o evento e o botão para abrir. Um lote por chamada. */
export const mailGuestInvites = safe("guest-list", async (ids: string[]) => {
  if (!ids.length) return;
  const rows = await db.query.guestListEntries.findMany({ where: inArray(schema.guestListEntries.id, ids), with: { event: { with: eventWith } } });
  const mails: Mail[] = rows.filter((r) => r.email).map((r) => {
    const e = r.event as EvRow;
    const plus = companionsLabel(r.guests);
    return {
      to: r.email!,
      subject: `Seu ingresso de lista: ${e.title}`,
      ...renderTx({
        preheader: `Entrada gratuita${plus ? ` ${plus}` : ""}. Mostre o QR code na portaria.`,
        eyebrow: "Lista free · Cortesia", title: "Seu ingresso de lista",
        paragraphs: [`${hello(r.name)} Seu nome está na lista free de ${e.title}: a entrada é gratuita${plus ? `, para você ${plus}` : ""}. Na portaria, mostre o QR code abaixo ou diga o seu nome.`],
        blocks: [
          { kind: "ticket", label: "Ingresso de lista · Entrada gratuita", name: r.name, sub: plus || undefined, qr: guestQrPngPath(r.token), code: "LISTA FREE" },
          eventBlock(e),
          { kind: "note", text: "Vale uma entrada e é só para este nome: não pode ser vendido nem transferido. A conferência de documento fica a critério do local." },
        ],
        cta: { label: "Abrir meu ingresso de lista", url: `/lista/${r.token}` },
        reason: `Você recebeu este e-mail porque o produtor de ${e.title} colocou ${r.email} na lista free do evento na Tickets Win.`,
      }, siteBase()),
    };
  });
  await sendEmails(mails);
});

/** Primeira publicação de um evento: o link para divulgar e o painel. */
export const mailEventPublished = safe("published", async (eventId: string) => {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), with: eventWith });
  if (!e?.createdByUserId) return;
  const c = await userContact(e.createdByUserId);
  if (!c) return;
  await sendTx(c.email, `Seu evento está no ar: ${e.title}`, {
    preheader: "A página já está pública. Hora de divulgar.",
    eyebrow: "Evento publicado", title: "Seu evento está no ar",
    paragraphs: [`${hello(c.name)} ${e.title} já tem página pública na Tickets Win. Compartilhe o link e acompanhe as vendas pelo painel.`],
    blocks: [eventBlock(e as EvRow), { kind: "rows", rows: [["Link do evento", `${siteBase().replace(/^https?:\/\//, "")}/eventos/${e.slug}`]] }],
    cta: { label: "Abrir o painel do evento", url: `/painel/evento/${e.id}` },
    link: { label: "Ver a página do evento", url: `/eventos/${e.slug}` },
    reason: "Você recebeu este e-mail porque publicou um evento na Tickets Win.",
  });
});

/* ============================== lista de espera ============================== */

export const mailLaunchSignup = safe("signup", async (email: string, eventId: string, kind: "abertura" | "presale") => {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), with: eventWith });
  if (!e) return;
  const when = kind === "presale" ? e.presaleAt : e.salesOpenAt;
  await sendTx(email, kind === "presale" ? `Você está na pré-venda de ${e.title}` : `Vamos te avisar: ${e.title}`, {
    preheader: kind === "presale" ? "Seu link exclusivo chega neste e-mail quando a pré-venda abrir." : "Você recebe um e-mail assim que as vendas abrirem.",
    eyebrow: kind === "presale" ? "Pré-venda" : "Lista de espera", title: "Você está na lista",
    paragraphs: [kind === "presale"
      ? `Quando a pré-venda de ${e.title} abrir${when ? ` (${dateNice(when)})` : ""}, mandamos para este e-mail um link exclusivo para comprar antes de todo mundo.`
      : `Assim que as vendas de ${e.title} abrirem${when ? ` (${dateNice(when)})` : ""}, avisamos neste e-mail.`],
    blocks: [eventBlock(e as EvRow)],
    cta: { label: "Ver o evento", url: `/eventos/${e.slug}` },
    reason: `Você recebeu este e-mail porque se cadastrou para ser avisado sobre ${e.title} na Tickets Win.`,
  });
});

/* ============================== lembrete ============================== */

/** Véspera do evento: cada titular recebe um lembrete com a data, o local e o caminho até o QR code. */
export async function runReminders(now = new Date()) {
  if (!emailEnabled()) return { sent: 0 };
  const from = new Date(now.getTime() + 18 * 3_600_000), to = new Date(now.getTime() + 30 * 3_600_000);
  const rows = await db.execute<{ id: string; holder: string; event_id: string; start_at: string }>(sql`
    select t.id, t.holder_user_id as holder, t.event_id, coalesce(s.start_at, e.start_at) as start_at
    from tickets t
    join events e on e.id = t.event_id
    join ticket_types tt on tt.id = t.ticket_type_id
    left join event_sessions s on s.id = tt.session_id
    where t.status = 'valid' and t.reminded_at is null and e.status = 'published'
      and coalesce(s.start_at, e.start_at) between ${from.toISOString()} and ${to.toISOString()}
    limit 400`);
  if (!rows.rows.length) return { sent: 0 };
  const groups = new Map<string, { holder: string; eventId: string; start: Date; ids: string[] }>();
  for (const r of rows.rows) {
    const k = `${r.holder}|${r.event_id}|${r.start_at}`;
    const g = groups.get(k) ?? { holder: r.holder, eventId: r.event_id, start: new Date(r.start_at), ids: [] };
    g.ids.push(r.id);
    groups.set(k, g);
  }
  // marca antes de enviar: um cron que roda de novo no meio não manda em dobro
  await db.update(tickets).set({ remindedAt: now }).where(inArray(tickets.id, rows.rows.map((r) => r.id)));
  const evs = await db.query.events.findMany({ where: inArray(events.id, [...new Set([...groups.values()].map((g) => g.eventId))]), with: eventWith });
  const evById = new Map(evs.map((e) => [e.id, e as EvRow]));
  const mails: Mail[] = [];
  for (const g of groups.values()) {
    const e = evById.get(g.eventId), c = await userContact(g.holder);
    if (!e || !c) continue;
    const day = (d: Date) => { const p = parts(d); return `${p.y}-${p.m}-${p.d}`; };
    const n = g.ids.length, today = day(g.start) === day(now);
    const maps = mapsUrl(e);
    mails.push({
      to: c.email,
      subject: `${today ? "É hoje" : "É amanhã"}: ${e.title}`,
      ...renderTx({
        preheader: `${dateNice(g.start)}. Seu QR code está em Meus ingressos.`,
        eyebrow: today ? "É hoje!" : "É amanhã!", title: e.title,
        paragraphs: [`${hello(c.name)} ${today ? "Chegou o dia." : "Falta pouco."} Você tem ${n === 1 ? "1 ingresso" : `${n} ingressos`} para ${dateNice(g.start)}. Deixe o QR code à mão (dá para salvar na carteira do celular) e chegue cedo para evitar fila.`],
        blocks: [{ ...eventBlock(e), when: dateNice(g.start) + (eventLabels(e).doors ? ` · ${eventLabels(e).doors}` : "") } as TxBlock],
        cta: { label: "Abrir meus ingressos", url: "/meus-ingressos" },
        ...(maps ? { link: { label: "Como chegar", url: maps } } : {}),
        reason: "Você recebeu este e-mail porque tem ingresso para este evento na Tickets Win.",
      }, siteBase()),
    });
  }
  return { sent: await sendEmails(mails) };
}

/** Dono da página do produtor (para avisos de equipe). */
export async function organizerName(orgId: string) {
  const o = await db.query.organizers.findFirst({ where: eq(organizers.id, orgId), columns: { name: true } });
  return o?.name ?? "Produtor";
}

/** Uma vez por hora: o registro de e-mails guarda só os últimos 30 dias. */
export async function pruneEmailLog(now = new Date()) {
  if (now.getUTCMinutes() !== 0) return "pula";
  await db.delete(schema.emailLog).where(lt(schema.emailLog.createdAt, new Date(now.getTime() - 30 * 86_400_000)));
  return "ok";
}
