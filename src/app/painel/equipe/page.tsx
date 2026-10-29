import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { PainelEquipe, type EquipeProps } from "@/components/painel/equipe";
import { db, schema } from "@/db";
import { painelAccess } from "@/lib/painel/access";
import { DAY, ended, nowMs, whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipe e check-in" };

/** Quem ajuda a tocar os eventos (admin ou portaria) e o acesso ao leitor de ingressos. */
export default async function PainelEquipePage() {
  const { user, org, role, events } = await painelAccess("portaria");
  const members = org ? await db.query.organizerMembers.findMany({ where: eq(schema.organizerMembers.organizerId, org.id) }) : [];
  const now = nowMs();
  const props: EquipeProps = {
    role,
    owner: { name: user.name || user.email, email: role === "owner" ? user.email : "" },
    members: members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((m) => ({ id: m.id, email: m.email, role: m.role === "admin" ? "admin" : "portaria", active: !!m.acceptedAt, me: m.userId === user.id })),
    events: events.filter((e) => e.status === "published" && !ended(e, now)).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((e) => {
      const days = Math.ceil((e.startAt.getTime() - now) / DAY);
      return { id: e.id, title: e.title, flyerId: e.flyerId, when: whenLabel(e), where: whereLabel(e), soon: days <= 1 };
    }),
  };
  return <PainelEquipe {...props} />;
}
