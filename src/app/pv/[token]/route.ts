import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { presaleCookie } from "@/lib/launch";

/** Link secreto da pré-venda: guarda o acesso num cookie e leva para a página do evento. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const site = new URL(req.url).origin;
  const s = await db.query.eventSignups.findFirst({ where: and(eq(schema.eventSignups.token, token), eq(schema.eventSignups.kind, "presale")) });
  const ev = s ? await db.query.events.findFirst({ where: eq(schema.events.id, s.eventId), columns: { id: true, slug: true } }) : null;
  if (!s || !ev) return NextResponse.redirect(new URL("/explorar", site));
  const res = NextResponse.redirect(new URL(`/eventos/${ev.slug}?pre=1#ingressos`, site));
  if (!s.usedAt) res.cookies.set(presaleCookie(ev.id), token, { httpOnly: true, sameSite: "lax", secure: site.startsWith("https"), maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
