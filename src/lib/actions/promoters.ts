"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope } from "@/lib/data/painel";
import { slugify } from "@/lib/format";
import { randomToken } from "@/lib/launch";

const { promoters } = schema;
type R = { ok: true } | { ok: false; error: string };

async function orgScope() {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  return s.org && s.role !== "portaria" ? s : null;
}

const promoterSchema = z.object({
  name: z.string().trim().min(2, "Nome do parceiro.").max(120),
  email: z.union([z.literal(""), z.email("E-mail inválido.")]),
  eventId: z.union([z.literal(""), z.uuid()]),
  pct: z.number().int().min(1, "Comissão de 1% a 50%.").max(50, "Comissão de 1% a 50%."),
  code: z.string().trim().max(40),
});

/** Novo link de divulgação com comissão. O código vira o link /r/<código>. */
export async function createPromoter(input: z.input<typeof promoterSchema>): Promise<R> {
  const s = await orgScope();
  if (!s?.org) return { ok: false, error: "Sem permissão." };
  const p = promoterSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const d = p.data;
  if (d.eventId && !s.events.some((e) => e.id === d.eventId)) return { ok: false, error: "Evento não encontrado." };
  let code = slugify(d.code || d.name).slice(0, 32) || randomToken(6);
  if (await db.query.promoters.findFirst({ where: eq(promoters.code, code), columns: { id: true } })) {
    if (d.code) return { ok: false, error: "Esse código já está em uso. Escolha outro." };
    code = `${code.slice(0, 26)}-${randomToken(4)}`;
  }
  await db.insert(promoters).values({
    organizerId: s.org.id, eventId: d.eventId || null, name: d.name, email: d.email || null,
    code, commissionPct: d.pct, token: randomToken(),
  });
  revalidatePath("/painel/marketing");
  return { ok: true };
}

export async function setPromoterActive(id: string, active: boolean): Promise<R> {
  const s = await orgScope();
  if (!s?.org) return { ok: false, error: "Sem permissão." };
  const r = await db.update(promoters).set({ active }).where(and(eq(promoters.id, id), eq(promoters.organizerId, s.org.id))).returning({ id: promoters.id });
  if (!r.length) return { ok: false, error: "Parceiro não encontrado." };
  revalidatePath("/painel/marketing");
  return { ok: true };
}
