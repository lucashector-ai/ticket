import "server-only";
import { and, count, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";

/*
 * Fila virtual por evento. Cada visitante (cookie tw_vid) que está na página do evento ou no checkout
 * manda um sinal a cada ~15 s. "Ativos" são os já liberados com sinal recente; quando eles chegam ao
 * limite do evento, quem chega entra na fila e é liberado por ordem de chegada conforme abrem vagas.
 *   auto  a fila só aparece com muita gente ao mesmo tempo (ativos >= limite ou alguém já esperando)
 *   on    todo mundo passa pela fila, liberando no máximo `limite` de cada vez
 *   off   sem fila
 */

export const VID_COOKIE = "tw_vid";
const ALIVE_MS = 45_000;
/** depois disso, quem foi liberado continua passando, mas não ocupa mais vaga */
const SLOT_MS = 20 * 60_000;

type Ev = { id: string; queueMode: string; queueLimit: number };
export type QueueState = { state: "ok" } | { state: "wait"; position: number; total: number; etaMin: number | null };

const { queueEntries: q } = schema;

async function counts(eventId: string, now: Date) {
  const alive = gt(q.lastSeen, new Date(now.getTime() - ALIVE_MS));
  const [[a], [w]] = await Promise.all([
    db.select({ n: count() }).from(q).where(and(eq(q.eventId, eventId), alive, gt(q.admittedAt, new Date(now.getTime() - SLOT_MS)))),
    db.select({ n: count() }).from(q).where(and(eq(q.eventId, eventId), alive, isNull(q.admittedAt))),
  ]);
  return { active: a?.n ?? 0, waiting: w?.n ?? 0 };
}

/** Entra (ou dá sinal) na fila do evento e devolve se a pessoa já pode comprar ou a posição dela. */
export async function queueEnter(e: Ev, vid: string): Promise<QueueState> {
  if (e.queueMode === "off") return { state: "ok" };
  const now = new Date();
  const [me] = await db.insert(q).values({ eventId: e.id, visitorId: vid, joinedAt: now, lastSeen: now })
    .onConflictDoUpdate({ target: [q.eventId, q.visitorId], set: { lastSeen: now } })
    .returning();
  if (me.admittedAt) return { state: "ok" };

  const { active, waiting } = await counts(e.id, now);
  const free = e.queueLimit - active;
  if (free > 0) {
    // libera os primeiros da fila (por ordem de chegada) até preencher as vagas
    await db.execute(sql`
      update ${q} set admitted_at = ${now}
      where event_id = ${e.id} and admitted_at is null and last_seen > ${new Date(now.getTime() - ALIVE_MS)}
        and visitor_id in (
          select visitor_id from ${q}
          where event_id = ${e.id} and admitted_at is null and last_seen > ${new Date(now.getTime() - ALIVE_MS)}
          order by joined_at asc limit ${free}
        )`);
  }
  const fresh = await db.query.queueEntries.findFirst({ where: and(eq(q.eventId, e.id), eq(q.visitorId, vid)) });
  if (fresh?.admittedAt) return { state: "ok" };

  const alive = gt(q.lastSeen, new Date(now.getTime() - ALIVE_MS));
  const [[ahead], [recent]] = await Promise.all([
    db.select({ n: count() }).from(q).where(and(eq(q.eventId, e.id), alive, isNull(q.admittedAt), lt(q.joinedAt, fresh?.joinedAt ?? now))),
    db.select({ n: count() }).from(q).where(and(eq(q.eventId, e.id), gt(q.admittedAt, new Date(now.getTime() - 5 * 60_000)))),
  ]);
  const position = (ahead?.n ?? 0) + 1;
  const perMin = (recent?.n ?? 0) / 5;
  return { state: "wait", position, total: Math.max(waiting, position), etaMin: perMin > 0 ? Math.max(1, Math.ceil(position / perMin)) : null };
}

/** Na hora de comprar: a fila deixa? (sem fila ligada ou pessoa já liberada) */
export async function queueAllows(e: Ev): Promise<boolean> {
  if (e.queueMode === "off") return true;
  const vid = (await cookies()).get(VID_COOKIE)?.value;
  if (vid) {
    const me = await db.query.queueEntries.findFirst({ where: and(eq(q.eventId, e.id), eq(q.visitorId, vid), isNotNull(q.admittedAt)) });
    if (me) return true;
  }
  if (e.queueMode === "on") return false;
  const { active, waiting } = await counts(e.id, new Date());
  return waiting === 0 && active < e.queueLimit;
}

/** Limpeza (cron): some quem não dá sinal há mais de 6 horas. */
export async function queueCleanup() {
  const r = await db.delete(q).where(lt(q.lastSeen, new Date(Date.now() - 6 * 3600_000))).returning({ id: q.visitorId });
  return r.length;
}
