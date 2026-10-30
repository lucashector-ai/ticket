import type { Metadata } from "next";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { PainelEquipe, type EquipeProps } from "@/components/painel/equipe";
import { db, schema } from "@/db";
import { painelAccess } from "@/lib/painel/access";
import { ago, DAY, ended, nowMs, whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipe e check-in" };

/** Quem ajuda a tocar os eventos (admin ou portaria) e o check-in: acessos do app da portaria de cada evento. */
export default async function PainelEquipePage() {
  const { user, org, role, events } = await painelAccess("portaria");
  const members = org ? await db.query.organizerMembers.findMany({ where: eq(schema.organizerMembers.organizerId, org.id) }) : [];
  const now = nowMs();
  const upcoming = events.filter((e) => e.status === "published" && !ended(e, now)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  // acessos do app da portaria de cada evento (quem gerencia vê e cria aqui mesmo)
  const L = schema.checkinLinks;
  const links = role !== "portaria" && upcoming.length
    ? await db.select().from(L).where(and(inArray(L.eventId, upcoming.map((e) => e.id)), isNull(L.revokedAt))).orderBy(L.createdAt)
    : [];
  const props: EquipeProps = {
    role,
    owner: { name: user.name || user.email, email: role === "owner" ? user.email : "" },
    members: members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((m) => ({ id: m.id, email: m.email, role: m.role === "admin" ? "admin" : "portaria", active: !!m.acceptedAt, me: m.userId === user.id })),
    events: upcoming.map((e) => {
      const days = Math.ceil((e.startAt.getTime() - now) / DAY);
      return {
        id: e.id, title: e.title, flyerId: e.flyerId, when: whenLabel(e), where: whereLabel(e), soon: days <= 1,
        links: links.filter((l) => l.eventId === e.id).map((l) => ({ id: l.id, label: l.label, token: l.token, code: l.code ?? "", email: l.email ?? null, sent: l.sentAt ? ago(l.sentAt, now) : null, opened: l.openedAt ? ago(l.openedAt, now) : null, scans: l.scans, used: l.lastUsedAt ? ago(l.lastUsedAt, now) : null })),
      };
    }),
  };
  return <PainelEquipe {...props} />;
}
