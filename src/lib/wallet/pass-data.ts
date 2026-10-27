import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/actions/tickets";
import { dateFull } from "@/lib/format";
import type { getTicketByCode } from "@/lib/data/ingressos";
import { eventLabels } from "@/lib/tickets/labels";

type Ticket = NonNullable<Awaited<ReturnType<typeof getTicketByCode>>>;

/** O que os dois passes (Apple e Google) mostram, montado uma vez a partir do ingresso. */
export async function passData(t: Ticket, site: string) {
  const L = eventLabels(t.event);
  // evento com várias datas: o ingresso vale para a data do seu lote
  const sess = t.ticketType.sessionId ? await db.query.eventSessions.findFirst({ where: eq(schema.eventSessions.id, t.ticketType.sessionId) }) : null;
  const start = sess?.startAt ?? t.event.startAt;
  const end = sess ? new Date(start.getTime() + 6 * 3600_000) : t.event.endAt ?? new Date(start.getTime() + 6 * 3600_000);
  const art = t.event.bannerId && /^\/midia\//.test(t.event.bannerId) ? `${site}${t.event.bannerId}` : null;
  return {
    code: t.code,
    qr: await qrPayload(t.code, t.secret),
    valid: t.status === "valid",
    used: t.status === "used",
    title: t.event.title,
    when: sess ? dateFull(start) : L.dateFull,
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
  };
}
export type PassData = Awaited<ReturnType<typeof passData>>;
