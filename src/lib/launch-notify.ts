import "server-only";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { mailLayout, sendEmails, type Mail } from "@/lib/email";
import { dateNice } from "@/lib/format";

const { events, eventSignups } = schema;
const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticket.oobo-site.workers.dev";

type Ev = { id: string; slug: string; title: string; salesOpenAt: Date | null };

/** Envia os links secretos da pré-venda para quem se cadastrou e ainda não recebeu. */
export async function sendPresaleLinks(e: Ev) {
  const list = await db.query.eventSignups.findMany({ where: and(eq(eventSignups.eventId, e.id), eq(eventSignups.kind, "presale"), isNull(eventSignups.notifiedAt)) });
  const mails: Mail[] = list.map((s) => ({
    to: s.email,
    subject: `Sua pré-venda de ${e.title} começou`,
    ...mailLayout({
      preheader: "Seu link exclusivo para comprar antes de todo mundo.",
      title: `A pré-venda de ${e.title} começou`,
      paragraphs: [
        "Você se cadastrou e ganhou acesso antes da venda geral. Este link é só seu e vale para uma compra.",
        e.salesOpenAt ? `A venda geral abre em ${dateNice(e.salesOpenAt)}. Até lá, os ingressos são só para quem tem o link.` : "Garanta o seu antes que acabe.",
      ],
      cta: { label: "Comprar na pré-venda", url: `${site()}/pv/${s.token}` },
      foot: "Não compartilhe este link: ele libera a compra para quem abrir primeiro.",
    }),
  }));
  const sent = await sendEmails(mails);
  if (sent) await db.update(eventSignups).set({ notifiedAt: new Date() }).where(inArray(eventSignups.id, list.map((s) => s.id)));
  return { total: list.length, sent };
}

/** Avisa quem pediu "me avise" (e quem estava na pré-venda e não comprou) que as vendas abriram. */
export async function sendOpeningNotice(e: Ev) {
  const list = await db.query.eventSignups.findMany({
    where: and(eq(eventSignups.eventId, e.id), isNull(eventSignups.usedAt), sql`((${eventSignups.kind} = 'abertura' and ${eventSignups.notifiedAt} is null) or ${eventSignups.kind} = 'presale')`),
  });
  const seen = new Set<string>();
  const mails: Mail[] = [];
  for (const s of list) {
    if (seen.has(s.email)) continue;
    seen.add(s.email);
    mails.push({
      to: s.email,
      subject: `Vendas abertas: ${e.title}`,
      ...mailLayout({
        preheader: "Os ingressos já estão à venda.",
        title: `As vendas de ${e.title} abriram`,
        paragraphs: ["Você pediu para ser avisado: os ingressos já estão à venda. Os primeiros lotes costumam acabar rápido."],
        cta: { label: "Comprar ingressos", url: `${site()}/eventos/${e.slug}` },
      }),
    });
  }
  const sent = await sendEmails(mails);
  const ids = list.filter((s) => s.kind === "abertura").map((s) => s.id);
  if (sent && ids.length) await db.update(eventSignups).set({ notifiedAt: new Date() }).where(inArray(eventSignups.id, ids));
  return { total: mails.length, sent };
}

/** Roda a cada minuto (cron): pré-vendas que começaram e aberturas que chegaram. */
export async function runLaunchJobs(now = new Date()) {
  const cols = { id: events.id, slug: events.slug, title: events.title, salesOpenAt: events.salesOpenAt };
  const presales = await db.select(cols).from(events).where(and(eq(events.status, "published"), lte(events.presaleAt, now), isNull(events.presaleSentAt)));
  for (const e of presales) {
    await sendPresaleLinks(e);
    await db.update(events).set({ presaleSentAt: now }).where(eq(events.id, e.id));
  }
  const openings = await db.select(cols).from(events).where(and(eq(events.status, "published"), lte(events.salesOpenAt, now), isNull(events.openingSentAt)));
  for (const e of openings) {
    await sendOpeningNotice(e);
    await db.update(events).set({ openingSentAt: now }).where(eq(events.id, e.id));
  }
  return { presales: presales.length, openings: openings.length };
}
