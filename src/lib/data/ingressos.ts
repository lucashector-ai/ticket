import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { tickets } = schema;

export type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicketByCode>>>;

/** Ingresso pelo código TW-XXXX-XXXX, com evento (local/cidade), lote e pedido. */
export async function getTicketByCode(code: string) {
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.code, code.trim().toUpperCase()),
    with: {
      event: { with: { venue: { with: { city: true } }, organizer: { columns: { name: true } } } },
      ticketType: true,
      order: true,
    },
  });
  return t ?? null;
}
