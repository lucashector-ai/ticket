import "server-only";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/*
 * Produtoras da conta e a produtora ativa (em nome de quem o painel, o criar evento, o financeiro, a equipe e as
 * configurações trabalham).
 *
 * - Dona: até MAX_ORGS_PER_ACCOUNT produtoras (organizers.owner_user_id), cada uma com os próprios eventos, equipe,
 *   dados de recebimento e saldo.
 * - Equipe: produtoras de outras pessoas em que a conta aceitou convite (organizer_members), como admin ou portaria.
 * - Ativa: a escolhida no seletor (cookie ORG_COOKIE com o id). O cookie só escolhe entre as produtoras da própria
 *   conta: um id de outra produtora é ignorado (cai na primeira da lista), então trocar o id não dá acesso a nada.
 */

export type PainelRole = "owner" | "admin" | "portaria";
export type Organizer = typeof schema.organizers.$inferSelect;
export type OrgAccess = { org: Organizer; role: PainelRole };

export const MAX_ORGS_PER_ACCOUNT = 3;
export const ORG_COOKIE = "tw_org";
export const PORTARIA_ONLY = "Na equipe desta produtora você está na portaria: criar e editar eventos é com o dono ou um admin.";

/** Produtoras da conta: as que é dona (da mais antiga para a mais nova) e depois as da equipe. */
export async function orgAccessList(userId: string): Promise<OrgAccess[]> {
  const { organizers, organizerMembers } = schema;
  const [own, mem] = await Promise.all([
    db.query.organizers.findMany({ where: eq(organizers.ownerUserId, userId), orderBy: [asc(organizers.createdAt)] }),
    db.query.organizerMembers.findMany({ where: eq(organizerMembers.userId, userId), with: { organizer: true }, orderBy: [asc(organizerMembers.createdAt)] }),
  ]);
  const out: OrgAccess[] = own.map((org) => ({ org, role: "owner" }));
  for (const m of mem) {
    if (!out.some((x) => x.org.id === m.organizerId)) out.push({ org: m.organizer, role: m.role === "admin" ? "admin" : "portaria" });
  }
  return out;
}

/** Id escolhido no seletor (fora de uma requisição, como nos testes, não há cookie). */
export async function chosenOrgId(): Promise<string | null> {
  try {
    return (await cookies()).get(ORG_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** A produtora ativa da conta, ou null se a conta não tem nenhuma. */
export function pickActive(list: OrgAccess[], chosen: string | null): OrgAccess | null {
  return list.find((x) => x.org.id === chosen) ?? list[0] ?? null;
}

export async function activeAccess(userId: string): Promise<OrgAccess | null> {
  const [list, chosen] = await Promise.all([orgAccessList(userId), chosenOrgId()]);
  return pickActive(list, chosen);
}

/**
 * Quem pode editar o evento: o dono e os admins da produtora do evento (a portaria não). Evento sem produtora
 * (antigo): só quem criou.
 */
export async function canEditEvent(userId: string, ev: { organizerId: string | null; createdByUserId: string | null }) {
  if (!ev.organizerId) return ev.createdByUserId === userId;
  const list = await orgAccessList(userId);
  return list.some((x) => x.org.id === ev.organizerId && x.role !== "portaria");
}
