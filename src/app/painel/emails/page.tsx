import type { Metadata } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";
import { PainelEmails, type EmailsProps } from "@/components/painel/emails/list";
import { db, schema } from "@/db";
import { emailEnabled } from "@/lib/email";
import { campaignStats, pct, reachable } from "@/lib/mail/data";
import { TEMPLATES } from "@/lib/mail/templates";
import { painelAccess } from "@/lib/painel/access";
import { ago, ended, nowMs, whenLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "E-mails" };

const sp = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d).replace(".", "");

/** Campanhas de e-mail do produtor: lista, números e o botão de nova campanha. */
export default async function PainelEmailsPage() {
  const { user, org, events } = await painelAccess("admin");
  const C = schema.emailCampaigns, T = schema.emailTemplates;
  const scope = org ? eq(C.organizerId, org.id) : and(isNull(C.organizerId), eq(C.userId, user.id));
  const [rows, saved] = await Promise.all([
    db.query.emailCampaigns.findMany({ where: scope, orderBy: [desc(C.updatedAt)], columns: { design: false, links: false } }),
    db.query.emailTemplates.findMany({ where: org ? eq(T.organizerId, org.id) : eq(T.userId, user.id), orderBy: [desc(T.createdAt)], columns: { id: true, name: true, createdAt: true } }),
  ]);
  const stats = await campaignStats(rows.map((r) => r.id));
  const contacts = await reachable({ orgId: org?.id ?? null, userId: user.id }, events.map((e) => e.id));
  const now = nowMs();
  const sentRows = rows.filter((r) => r.status === "sent" || r.status === "sending");
  const tot = sentRows.reduce((a, r) => { const s = stats.get(r.id); return s ? { sent: a.sent + s.sent, opened: a.opened + s.opened, clicked: a.clicked + s.clicked, unsub: a.unsub + s.unsub } : a; }, { sent: 0, opened: 0, clicked: 0, unsub: 0 });

  const props: EmailsProps = {
    emailOn: emailEnabled(),
    kpis: { contacts, sent: tot.sent, open: pct(tot.opened, tot.sent), click: pct(tot.clicked, tot.sent), unsub: tot.unsub, campaigns: sentRows.length },
    campaigns: rows.map((r) => {
      const s = stats.get(r.id);
      const when = r.status === "sent" && r.sentAt ? `Enviada ${sp(r.sentAt)}` : r.status === "scheduled" && r.scheduledAt ? `Agendada para ${sp(r.scheduledAt)}` : r.status === "sending" ? "Enviando agora" : `Editada ${ago(r.updatedAt, now)}`;
      return {
        id: r.id, name: r.name, subject: r.subject, status: r.status, when,
        recipients: s?.total ?? 0, open: s?.sent ? pct(s.opened, s.sent) : "—", click: s?.sent ? pct(s.clicked, s.sent) : "—",
        progress: s && s.total ? Math.round(((s.total - s.queued) / s.total) * 100) : 0,
      };
    }),
    templates: TEMPLATES,
    saved: saved.map((t) => ({ id: t.id, name: t.name })),
    events: events.filter((e) => e.status !== "draft").map((e) => ({ id: e.id, title: e.title, when: whenLabel(e), past: ended(e, now), flyerId: e.flyerId })),
  };
  return <PainelEmails {...props} />;
}
