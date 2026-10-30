import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/tickets/qr";
import { dateFull, dateNice } from "@/lib/format";
import type { getTicketByCode } from "@/lib/data/ingressos";
import { eventLabels } from "@/lib/tickets/labels";
import { wideArt } from "@/lib/event-art";

type Ticket = NonNullable<Awaited<ReturnType<typeof getTicketByCode>>>;

/** O que os dois passes (Apple e Google) mostram, montado uma vez a partir do ingresso. */
export async function passData(t: Ticket, site: string) {
  const L = eventLabels(t.event);
  // evento com várias datas: o ingresso vale para a data do seu lote
  const sess = t.ticketType.sessionId ? await db.query.eventSessions.findFirst({ where: eq(schema.eventSessions.id, t.ticketType.sessionId) }) : null;
  const start = sess?.startAt ?? t.event.startAt;
  const end = sess ? new Date(start.getTime() + 6 * 3600_000) : t.event.endAt ?? new Date(start.getTime() + 6 * 3600_000);
  // faixa 3:1 do passe: recorte do banner ou, só com cartaz, o banner montado com ele (DM-2)
  const wide = wideArt(t.event, "carteira");
  const art = wide ? `${site}${wide}` : null;
  /* quando o passe fica "relevante" (tela de bloqueio, toque duplo): cada data em que o ingresso vale,
     de 3h antes até o fim. Ingresso sem data própria num evento de várias datas vale em todas. */
  const sessions = sess ? [sess] : await db.query.eventSessions.findMany({ where: eq(schema.eventSessions.eventId, t.event.id), orderBy: (x, { asc }) => [asc(x.startAt)] });
  const H = 3600_000;
  const windows = (sessions.length ? sessions.map((x) => x.startAt) : [start])
    .map((d) => ({ from: new Date(d.getTime() - 3 * H), to: new Date(d.getTime() + 6 * H) }))
    .filter((w) => w.to.getTime() > Date.now()).slice(0, 10);
  const lat = Number(t.event.venue?.lat), lng = Number(t.event.venue?.lng);
  const performers = (await db.query.eventArtists.findMany({ where: eq(schema.eventArtists.eventId, t.event.id), with: { artist: { columns: { name: true } } }, limit: 6 })).map((x) => x.artist.name);
  return {
    code: t.code,
    qr: await qrPayload(t.code, t.secret),
    valid: t.status === "valid",
    used: t.status === "used",
    title: t.event.title,
    when: sess ? dateFull(start) : L.dateFull,
    whenShort: sess ? dateNice(start) : L.dateNice,
    doors: L.doors,
    venue: L.venue,
    address: L.addr,
    city: t.event.venue?.city.name ?? "",
    uf: t.event.venue?.city.uf ?? "",
    type: [t.ticketType.sector, t.ticketType.name].filter(Boolean).join(" · ") || "Ingresso",
    holder: t.holderName ?? "",
    start, end,
    url: `${site}/ingressos/${t.code}`,
    eventId: t.event.id,
    art,
    banner: t.event.bannerId,
    windows,
    geo: Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null,
    performers,
  };
}
export type PassData = Awaited<ReturnType<typeof passData>>;
