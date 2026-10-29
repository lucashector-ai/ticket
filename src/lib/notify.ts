import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailEnabled, sendEmails, sendTx, siteBase, type Mail } from "@/lib/email";
import { brl, dateNice, parts } from "@/lib/format";
import { renderTx, type TxBlock } from "@/lib/mail/tx";
import { sellerNet } from "@/lib/resale";
import { eventLabels } from "@/lib/tickets/labels";

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
const banner = (e: { bannerId: string | null; media: { share?: string; home?: string } | null }) =>
  (e.bannerId?.startsWith("/midia/") ? e.bannerId : null) ?? (e.media?.share?.startsWith("/") ? e.media.share : null);

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

type OtpType = "email-verification" | "forget-password" | "sign-in";

/** Código de 6 dígitos do Neon Auth (ativar conta, redefinir senha ou entrar sem senha). */
export async function mailAuthCode(type: OtpType, email: string, code: string, name?: string | null) {
  const e = encodeURIComponent(email);
  if (type === "forget-password") {
    return sendTx(email, `${code} é o seu código para redefinir a senha`, {
      preheader: "Use este código para criar uma senha nova. Ele vale por poucos minutos.",
      title: "Redefinir sua senha", paragraphs: [`${hello(name)} Recebemos um pedido para trocar a senha da sua conta na Tickets Win. Use o código abaixo.`],
      blocks: [{ kind: "code", code, note: "Vale por poucos minutos. Não compartilhe com ninguém." }],
      cta: { label: "Criar nova senha", url: `/esqueci-senha?email=${e}&codigo=1` },
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
    cta: { label: "Redefinir senha", url: "/esqueci-senha" },
    link: { label: "Falar com a Ajuda", url: "/ajuda" },
  });
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
  const items = o.tickets.map((t) => ({
    name: t.ticketType.name + (t.halfPrice ? " · meia" : ""),
    sub: [t.holderName && `Titular: ${t.holderName}`, t.ticketType.session ? dateNice(t.ticketType.session.startAt) : null].filter(Boolean).join(" · "),
    right: t.code,
  }));
  const rows: [string, string][] = [["Pedido", `nº ${o.number ?? "—"}`]];
  if (!free) rows.push(["Pagamento", o.paymentMethod === "card" && o.installments > 1 ? `Cartão em ${o.installments}x` : METHOD[o.paymentMethod ?? "pix"] ?? "Pix"]);
  if (!free && o.feeCents) rows.push(["Taxa de serviço", brl(o.feeCents)]);
  rows.push(["Total", free ? "Grátis" : brl(o.totalCents)]);
  const maps = mapsUrl(e);
  await sendTx(to, resale ? `Seu ingresso da revenda: ${e.title}` : free ? `Ingresso garantido: ${e.title}` : `Compra confirmada: ${e.title}`, {
    preheader: `${n} ${n === 1 ? "ingresso" : "ingressos"} para ${e.title}. O QR code já está em Meus ingressos.`,
    eyebrow: `Pedido nº ${o.number ?? ""}`.trim(),
    title: resale ? "O ingresso é seu" : free ? "Ingresso garantido!" : "Compra confirmada!",
    paragraphs: [`${hello(o.buyerName)} ${resale ? "Você comprou um ingresso na revenda oficial. O QR code anterior foi cancelado e um novo já é seu." : n === 1 ? "Seu ingresso está garantido." : `Seus ${n} ingressos estão garantidos.`} Mostre o QR code na entrada: ele fica em Meus ingressos e pode ir para a carteira do celular.`],
    blocks: [eventBlock(e), { kind: "items", title: n === 1 ? "Seu ingresso" : "Seus ingressos", items }, { kind: "rows", rows }, { kind: "note", text: "Não tire print do QR code para mandar a outras pessoas: ele muda quando o ingresso é transferido. Para passar o ingresso, use Transferir em Meus ingressos." }],
    cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
    ...(maps ? { link: { label: "Como chegar", url: maps } } : {}),
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

/** Quem recebe ganha o link para aceitar; quem enviou recebe a confirmação. */
export const mailTransferSent = safe("transfer", async (transferId: string) => {
  const x = await transferData(transferId);
  if (!x) return;
  const fromName = x.from?.name || "Alguém";
  const ticket: TxBlock = { kind: "items", items: [{ name: x.t.ticketType.name + (x.t.halfPrice ? " · meia" : ""), sub: "Ingresso digital com QR code" }] };
  const mails: Mail[] = [{
    to: x.tr.toEmail,
    subject: `${firstName(fromName) || fromName} te enviou um ingresso para ${x.e.title}`,
    ...renderTx({
      preheader: "Aceite para o ingresso ir para a sua conta.",
      eyebrow: "Ingresso recebido", title: `${firstName(fromName) || fromName} te enviou um ingresso`,
      paragraphs: [`${fromName} transferiu um ingresso de ${x.e.title} para este e-mail. Aceite para ele aparecer em Meus ingressos com um QR code novo, só seu.`],
      blocks: [eventBlock(x.e), ticket, { kind: "note", text: "Se você ainda não tem conta, crie com este mesmo e-mail. É grátis." }],
      cta: { label: "Aceitar ingresso", url: `/transferencia/${x.tr.token}` },
      reason: `Você recebeu este e-mail porque ${fromName} transferiu um ingresso para ${x.tr.toEmail} na Tickets Win.`,
    }, siteBase()),
  }];
  if (x.from) mails.push({
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
  await sendTx(x.from.email, `${firstName(to) || to} aceitou o seu ingresso`, {
    preheader: `O ingresso de ${x.e.title} agora está na conta de ${to}.`,
    eyebrow: x.e.title, title: "Transferência concluída",
    paragraphs: [`${to} aceitou o ingresso de ${x.e.title}. Agora ele está na conta dessa pessoa, com um QR code novo.`],
    cta: { label: "Ver meus ingressos", url: "/meus-ingressos" },
    reason: "Você recebeu este e-mail porque transferiu um ingresso na Tickets Win.",
  });
});

/** Quem recebeu fica sabendo que a transferência foi cancelada por quem enviou. */
export const mailTransferCancelled = safe("transfer-x", async (transferId: string) => {
  const x = await transferData(transferId);
  if (!x) return;
  await sendTx(x.tr.toEmail, `Transferência cancelada: ${x.e.title}`, {
    preheader: "O ingresso voltou para quem enviou.",
    title: "Transferência cancelada",
    paragraphs: [`${x.from?.name || "Quem enviou"} cancelou a transferência do ingresso de ${x.e.title}. O link que você recebeu não vale mais.`],
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
    paragraphs: [`${inviter || orgName} adicionou este e-mail à equipe de ${orgName} na Tickets Win.`, "Entre (ou crie a conta) com este mesmo e-mail e o painel do produtor já abre com o seu acesso."],
    blocks: [{ kind: "rows", rows: [["Produtor", orgName], ["Função", ROLE_LABEL[role] ?? role]] }],
    cta: { label: "Abrir o painel", url: "/painel" },
    reason: `Você recebeu este e-mail porque ${orgName} convidou ${email} para a equipe na Tickets Win.`,
  });
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
