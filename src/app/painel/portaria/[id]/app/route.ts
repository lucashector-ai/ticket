import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { painelAccess } from "@/lib/painel/access";
import { newAccessCode } from "@/lib/portaria";

/**
 * "Abrir app da portaria" no painel: cria (ou reaproveita) o acesso pessoal desta pessoa ao evento e abre o
 * app da portaria (/portaria) já conectado. Quem é da equipe não precisa receber código de ninguém.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, events } = await painelAccess("portaria");
  const e = events.find((x) => x.id === id);
  if (!e) return NextResponse.redirect(new URL("/painel/equipe", req.url), 303);
  const label = (user.name?.trim() || user.email).slice(0, 60);
  const L = schema.checkinLinks;
  let link = await db.query.checkinLinks.findFirst({ where: and(eq(L.eventId, e.id), eq(L.createdByUserId, user.id), eq(L.label, label), isNull(L.revokedAt)), columns: { token: true } });
  if (!link) {
    for (let i = 0; i < 5 && !link; i++) {
      const [row] = await db.insert(L).values({ eventId: e.id, token: randomBytes(18).toString("base64url"), code: newAccessCode(), label, createdByUserId: user.id }).onConflictDoNothing().returning({ token: L.token });
      if (row) link = row;
    }
  }
  if (!link) return NextResponse.redirect(new URL("/painel/equipe?erro=acesso", req.url), 303);
  return NextResponse.redirect(new URL(`/portaria/entrar/${link.token}`, req.url), 303);
}
