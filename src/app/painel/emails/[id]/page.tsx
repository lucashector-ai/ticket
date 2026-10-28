import type { Metadata } from "next";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CampaignView, type CampaignProps } from "@/components/painel/emails/campaign";
import { db, schema } from "@/db";
import { emailEnabled } from "@/lib/email";
import { campaignStats, designEventIds, loadEvents, orgInfo, pct, resolveAudience, upcomingIds } from "@/lib/mail/data";
import { normalizeDesign } from "@/lib/mail/design";
import { brl } from "@/lib/format";
import { painelAccess } from "@/lib/painel/access";
import { ended, nowMs, whenLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campanha de e-mail" };

const sp = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
function localInput(d: Date | null) {
  if (!d) return "";
  const o: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[x.type] = x.value;
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

/** Uma campanha: público, remetente, assunto, conteúdo (editor) e envio; depois de enviada, o relatório. */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, org, events } = await painelAccess("admin");
  const C = schema.emailCampaigns;
  const c = await db.query.emailCampaigns.findFirst({ where: and(eq(C.id, id), org ? eq(C.organizerId, org.id) : and(isNull(C.organizerId), eq(C.userId, user.id))) });
  if (!c) notFound();
  const sender = { orgId: org?.id ?? null, userId: user.id };
  const now = nowMs();
  const own = events.filter((e) => e.status !== "draft");
  const design = normalizeDesign(c.design);
  const up = await upcomingIds(sender);
  const [infos, people, cps] = await Promise.all([
    loadEvents([...own.map((e) => e.id), ...designEventIds(design), ...up]),
    c.status === "draft" || c.status === "scheduled" ? resolveAudience(c.audience, sender, events.map((e) => e.id)) : Promise.resolve([]),
    own.length ? db.query.coupons.findMany({ where: and(inArray(schema.coupons.eventId, own.map((e) => e.id)), eq(schema.coupons.active, true)) }) : Promise.resolve([]),
  ]);

  let report: CampaignProps["report"] = null;
  if (c.status === "sent" || c.status === "sending" || c.status === "cancelled") {
    const st = (await campaignStats([c.id])).get(c.id) ?? { total: 0, queued: 0, sent: 0, failed: 0, opened: 0, clicked: 0, unsub: 0 };
    const S = schema.emailSends;
    const rows = await db.select({ email: S.email, name: S.name, status: S.status, openedAt: S.openedAt, clickedAt: S.clickedAt, unsubscribedAt: S.unsubscribedAt })
      .from(S).where(eq(S.campaignId, c.id)).orderBy(desc(S.clickedAt), desc(S.openedAt)).limit(300);
    const clicks = c.linkClicks ?? {};
    report = {
      total: st.total, sent: st.sent, queued: st.queued, failed: st.failed,
      opened: st.opened, clicked: st.clicked, unsub: st.unsub, openPct: pct(st.opened, st.sent), clickPct: pct(st.clicked, st.sent), unsubPct: pct(st.unsub, st.sent),
      links: (c.links ?? []).map((u, i) => ({ url: u.replace(/[?&]utm_[^#]*/, ""), clicks: clicks[String(i)] ?? 0 })).filter((l) => !l.url.includes("/e/sair/")).sort((a, b) => b.clicks - a.clicks).slice(0, 12),
      people: rows.map((r) => ({ email: r.email, name: r.name ?? "", status: r.unsubscribedAt ? "unsub" : r.clickedAt ? "click" : r.openedAt ? "open" : r.status })),
    };
  }

  const props: CampaignProps = {
    emailOn: emailEnabled(), userEmail: user.email ?? "",
    c: {
      id: c.id, name: c.name, status: c.status, format: c.format === "evento" && c.content ? "evento" : "livre", content: c.content ?? null, subject: c.subject, preheader: c.preheader, fromName: c.fromName, replyTo: c.replyTo,
      audience: c.audience, design, scheduledAt: localInput(c.scheduledAt), scheduledLabel: c.scheduledAt ? sp(c.scheduledAt) : "",
      sentLabel: c.sentAt ? sp(c.sentAt) : c.startedAt ? sp(c.startedAt) : "", tested: !!c.testSentAt,
    },
    count: people.length,
    events: own.map((e) => ({ id: e.id, title: e.title, when: whenLabel(e), past: ended(e, now) })),
    ctx: { org: orgInfo(org ?? null, c.fromName || user.name || "Produtor"), events: infos, upcoming: up.filter((x) => infos[x]) },
    coupons: cps.map((x) => ({ code: x.code, eventId: x.eventId ?? "", label: x.percentOff ? `${x.percentOff}%` : brl(x.amountOffCents ?? 0) })),
    report,
  };
  return <CampaignView {...props} />;
}
