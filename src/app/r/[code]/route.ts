import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { REF_COOKIE } from "@/lib/promoters";

/** Link de divulgação /r/<código>: conta o clique, guarda o parceiro num cookie e leva ao evento. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const site = new URL(req.url).origin;
  const p = await db.query.promoters.findFirst({ where: eq(schema.promoters.code, code.toLowerCase()), with: { event: { columns: { slug: true } }, organizer: { columns: { slug: true } } } });
  if (!p || !p.active) return NextResponse.redirect(new URL("/explorar", site));
  await db.update(schema.promoters).set({ clicks: sql`${schema.promoters.clicks} + 1` }).where(eq(schema.promoters.id, p.id));
  const to = p.event ? `/eventos/${p.event.slug}` : p.organizer?.slug ? `/produtor/${p.organizer.slug}` : "/explorar";
  const res = NextResponse.redirect(new URL(to, site));
  res.cookies.set(REF_COOKIE, p.code, { httpOnly: true, sameSite: "lax", secure: site.startsWith("https"), maxAge: 60 * 60 * 24 * 30, path: "/" });
  return res;
}
