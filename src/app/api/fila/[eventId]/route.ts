import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { randomToken } from "@/lib/launch";
import { queueEnter, VID_COOKIE } from "@/lib/queue";

/** Entrada e sinal da fila virtual: { state: "ok" } ou { state: "wait", position, total, etaMin }. */
export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return NextResponse.json({ state: "ok" });
  const ev = await db.query.events.findFirst({ where: eq(schema.events.id, eventId), columns: { id: true, queueMode: true, queueLimit: true } });
  if (!ev) return NextResponse.json({ state: "ok" });
  const jar = await cookies();
  let vid = jar.get(VID_COOKIE)?.value;
  const isNew = !vid;
  vid ??= randomToken(20);
  const res = NextResponse.json(await queueEnter(ev, vid), { headers: { "cache-control": "no-store" } });
  if (isNew) res.cookies.set(VID_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", maxAge: 60 * 60 * 24 * 7, path: "/" });
  return res;
}
