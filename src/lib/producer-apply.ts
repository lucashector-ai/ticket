import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isProducer } from "@/lib/data/producer";

/*
 * Inscrição de produtor: quem quer criar evento se inscreve, a equipe aprova (no mesmo dia)
 * e só então a pessoa faz o cadastro do produtor e cria eventos.
 * Quem já era produtor antes da inscrição existir continua liberado.
 */

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export const SOURCES = ["Instagram", "TikTok", "Indicação de outro produtor", "Indicação de amigo", "Comprei ingresso na Tickets Win", "Google", "Evento ou feira", "Outro"] as const;
export const CATEGORIES = ["Festa / balada", "Eletrônica", "Universitária", "Sertanejo", "Funk", "Pagode / samba", "Rock / indie", "Hip-hop / rap", "Show", "Festival", "Teatro / stand-up", "Outro"] as const;

/** `source` da inscrição criada quando a equipe libera a conta direto pela central (sem a pessoa se inscrever). */
export const CENTRAL_SOURCE = "Central Tickets Win";

/**
 * `producer`: produtor por conta própria (dona de produtora com o cadastro concluído, ou produtor antigo que criou
 * evento fora de produtora alheia). `team`: só está na equipe (admin/portaria) de outra produtora: abre o painel
 * dela e cria evento lá (admin), mas NÃO conclui o cadastro de produtor sem aprovação (SEC-001).
 */
export type ProducerStatus = "producer" | "team" | "approved" | "pending" | "rejected" | "none";

export async function latestApplication(userId: string) {
  return (await db.query.producerApplications.findFirst({ where: eq(schema.producerApplications.userId, userId), orderBy: [desc(schema.producerApplications.createdAt)] })) ?? null;
}

/**
 * Produtor aprovado por conta própria: dona de uma produtora com o cadastro concluído, ou quem já criava evento antes
 * da inscrição existir (evento sem produtora ou numa produtora da própria conta). Evento criado como admin na
 * produtora de outra pessoa não conta: isso é trabalho da equipe, não aprovação.
 */
export async function ownProducer(userId: string): Promise<boolean> {
  const r = await db.execute<{ ok: boolean }>(sql`
    select (
      exists(select 1 from ${schema.organizers} o where o.owner_user_id = ${userId} and o.onboarding is not null)
      or exists(
        select 1 from ${schema.events} e left join ${schema.organizers} o on o.id = e.organizer_id
        where e.created_by_user_id = ${userId} and (e.organizer_id is null or o.owner_user_id = ${userId})
      )
    ) as ok`);
  return !!r.rows[0]?.ok;
}

/**
 * Onde a pessoa está no caminho para criar eventos. A inscrição aprovada (ou a liberação da central) vem antes da
 * equipe: quem está numa equipe e foi aprovado faz o próprio cadastro. `app` é sempre a última inscrição.
 */
export async function producerStatus(user: { id: string; email?: string | null; emailVerified?: boolean | null }): Promise<{ status: ProducerStatus; app: Awaited<ReturnType<typeof latestApplication>> }> {
  const [own, app] = await Promise.all([ownProducer(user.id), latestApplication(user.id)]);
  if (own) return { status: "producer", app };
  if (app?.status === "approved") return { status: "approved", app };
  if (await isProducer(user)) return { status: "team", app };
  return { status: app?.status ?? "none", app };
}

/** Pode concluir o cadastro de produtor (/produtores/cadastro): inscrição aprovada ou produtor que atualiza o cadastro. */
export const canOnboard = (status: ProducerStatus) => status === "approved" || status === "producer";

/** Pode criar evento novo (a produtora vem da produtora ativa; a portaria é barrada depois, em saveEventAs). */
export const canCreateEvents = (status: ProducerStatus) => status === "producer" || status === "team";
