import "server-only";
import { cache } from "react";
import { eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { organizers, organizerMembers, events } = schema;

/**
 * Regra de "virou produtor": concluiu o cadastro de produtor (/produtores/cadastro), está na
 * equipe de um produtor (convite aceito ou pendente para o e-mail confirmado da conta) ou já criou evento.
 * Só quem é produtor vê Painel do produtor e Meus eventos.
 */
export const isProducer = cache(async (user: { id: string; email?: string | null; emailVerified?: boolean | null }) => {
  const org = await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, user.id), columns: { onboarding: true } });
  if (org?.onboarding) return true;
  const member = await db.query.organizerMembers.findFirst({
    where: user.email && user.emailVerified ? or(eq(organizerMembers.userId, user.id), sql`lower(${organizerMembers.email}) = lower(${user.email})`) : eq(organizerMembers.userId, user.id),
    columns: { id: true },
  });
  if (member) return true;
  const ev = await db.query.events.findFirst({ where: eq(events.createdByUserId, user.id), columns: { id: true } });
  return !!ev;
});
