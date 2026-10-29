"use server";

import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { mailApplicationReceived } from "@/lib/notify";
import { CATEGORIES, producerStatus, SOURCES, UFS } from "@/lib/producer-apply";

const appSchema = z.object({
  firstName: z.string().trim().min(2, "Digite seu nome.").max(80),
  lastName: z.string().trim().min(2, "Digite seu sobrenome.").max(80),
  phone: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => /^[1-9]\d{9,10}$/.test(v), "Digite o telefone com DDD."),
  company: z.string().trim().max(120),
  city: z.string().trim().min(2, "Digite a cidade do evento.").max(120),
  uf: z.enum(UFS, { message: "Escolha o estado." }),
  audience: z.string().trim().min(10, "Conte um pouco mais sobre o público (pelo menos uma frase).").max(600),
  category: z.enum(CATEGORIES, { message: "Escolha a categoria." }),
  avgTicket: z.string().transform((v) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100)).refine((v) => Number.isFinite(v) && v >= 0 && v <= 10_000_00, "Digite o ticket médio em reais."),
  expected: z.string().transform((v) => Number(v.replace(/\D/g, ""))).refine((v) => Number.isInteger(v) && v >= 10 && v <= 500_000, "Digite o público esperado (número de pessoas)."),
  source: z.enum(SOURCES, { message: "Conte como chegou até a Tickets Win." }),
  instagram: z.string().trim().max(120),
});
export type AppInput = z.input<typeof appSchema>;

/** Envia a inscrição de produtor; a equipe recebe por e-mail e aprova na central. */
export async function submitApplication(input: AppInput): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta para se inscrever." };
  const st = await producerStatus(user);
  if (st.status === "producer" || st.status === "approved") return { ok: false, error: "Sua conta de produtor já está liberada." };
  if (st.status === "pending") return { ok: false, error: "Sua inscrição já está em análise. Respondemos no mesmo dia útil." };
  const p = appSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const d = p.data;
  const ig = d.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  const [row] = await db.insert(schema.producerApplications).values({
    userId: user.id, email: user.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone, company: d.company || null,
    city: d.city, uf: d.uf, audience: d.audience, category: d.category, avgTicketCents: d.avgTicket, expected: d.expected,
    source: d.source, instagram: ig ? `@${ig}` : null,
  }).returning();
  after(() => mailApplicationReceived(row));
  return { ok: true };
}
