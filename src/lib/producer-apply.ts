import "server-only";
import { desc, eq } from "drizzle-orm";
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

export type ProducerStatus = "producer" | "approved" | "pending" | "rejected" | "none";

export async function latestApplication(userId: string) {
  return (await db.query.producerApplications.findFirst({ where: eq(schema.producerApplications.userId, userId), orderBy: [desc(schema.producerApplications.createdAt)] })) ?? null;
}

/** Onde a pessoa está no caminho para criar eventos. */
export async function producerStatus(user: { id: string; email?: string | null }): Promise<{ status: ProducerStatus; app: Awaited<ReturnType<typeof latestApplication>> }> {
  const [already, app] = await Promise.all([isProducer(user), latestApplication(user.id)]);
  if (already) return { status: "producer", app };
  return { status: app?.status ?? "none", app };
}
