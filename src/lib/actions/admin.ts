"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { ADMIN_PATH, adminUser } from "@/lib/admin";
import { logSecurity } from "@/lib/mfa";
import { mailApplicationApproved, mailApplicationRejected, mailPayoutUpdated } from "@/lib/notify";

type R = { ok: boolean; error?: string };

/** Só admin com app autenticador mexe em qualquer coisa. */
async function guard() {
  const a = await adminUser();
  if (!a) throw new Error("NOT_FOUND");
  if (!a.secure) return { ok: false as const, error: "Ative o app autenticador na sua conta para usar a central." };
  return { ok: true as const, admin: a };
}

const uuid = z.string().uuid();

/** Aprova ou recusa uma inscrição de produtor e avisa a pessoa por e-mail. */
export async function reviewApplication(id: string, approve: boolean, note: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Inscrição não encontrada." };
  const app = await db.query.producerApplications.findFirst({ where: eq(schema.producerApplications.id, id) });
  if (!app) return { ok: false, error: "Inscrição não encontrada." };
  const clean = note.trim().slice(0, 600) || null;
  const [row] = await db.update(schema.producerApplications)
    .set({ status: approve ? "approved" : "rejected", note: clean, reviewedBy: g.admin.email, reviewedAt: new Date() })
    .where(eq(schema.producerApplications.id, id)).returning();
  await logSecurity(g.admin.id, "admin", `${approve ? "Aprovou" : "Recusou"} produtor ${app.email}`);
  after(() => (approve ? mailApplicationApproved(row) : mailApplicationRejected(row, clean)));
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

const PAYOUT_NEXT: Record<string, string[]> = { requested: ["processing", "paid", "rejected"], processing: ["paid", "rejected"] };

/** Atualiza um saque (processando, pago, recusado) e avisa o produtor. */
export async function updatePayout(id: string, status: "processing" | "paid" | "rejected", note: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Saque não encontrado." };
  const p = await db.query.payoutRequests.findFirst({ where: eq(schema.payoutRequests.id, id) });
  if (!p) return { ok: false, error: "Saque não encontrado." };
  if (!PAYOUT_NEXT[p.status]?.includes(status)) return { ok: false, error: "Esse saque não pode mudar para esse status." };
  const clean = note.trim().slice(0, 600) || null;
  await db.update(schema.payoutRequests).set({ status, note: clean, paidAt: status === "paid" ? new Date() : null }).where(eq(schema.payoutRequests.id, id));
  await logSecurity(g.admin.id, "admin", `Saque ${id.slice(0, 8)} → ${status}`);
  after(() => mailPayoutUpdated(p.userId, p.amountCents, status, clean));
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
