"use server";

import { createHmac, randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

const { tickets, ticketTransfers } = schema;

/** Payload assinado do QR: ONDE|código|assinatura (HMAC do segredo do ingresso). */
export async function qrPayload(code: string, secret: string) {
  const sig = createHmac("sha256", process.env.NEON_AUTH_COOKIE_SECRET ?? "onde").update(`${code}:${secret}`).digest("base64url").slice(0, 16);
  return `ONDE|${code}|${sig}`;
}

/** Transfere um ingresso para outro e-mail. O QR antigo é cancelado (segredo rotacionado). */
export async function transferTicket(_prev: { ok?: boolean; error?: string } | null, formData: FormData) {
  const user = await getSessionUser();
  if (!user) return { error: "Faça login para transferir." };
  const parsed = z.object({ ticketId: z.string().uuid(), email: z.string().email("Confira o e-mail.") }).safeParse({ ticketId: formData.get("ticketId"), email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const t = await db.query.tickets.findFirst({ where: and(eq(tickets.id, parsed.data.ticketId), eq(tickets.holderUserId, user.id)), with: { event: { columns: { transferEnabled: true } } } });
  if (!t) return { error: "Ingresso não encontrado." };
  if (!t.event.transferEnabled) return { error: "O produtor deste evento não permite transferir ingressos." };
  if (t.status !== "valid") return { error: "Este ingresso não pode ser transferido." };
  const listed = await db.query.resaleListings.findFirst({ where: and(eq(schema.resaleListings.ticketId, t.id), inArray(schema.resaleListings.status, ["active", "reserved"])), columns: { id: true } });
  if (listed) return { error: "Este ingresso está na revenda. Tire do anúncio antes de transferir." };
  const token = randomBytes(24).toString("hex");
  await db.insert(ticketTransfers).values({ ticketId: t.id, fromUserId: user.id, toEmail: parsed.data.email.toLowerCase(), token, status: "pending" });
  // nesta fase a transferência é imediata: o titular passa a ser o e-mail de destino
  await db.update(tickets).set({ status: "transferred", secret: randomBytes(16).toString("hex") }).where(eq(tickets.id, t.id));
  revalidatePath("/meus-ingressos");
  return { ok: true };
}
