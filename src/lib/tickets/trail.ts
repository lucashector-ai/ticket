import "server-only";
import { db, schema } from "@/db";

/*
 * Rastro de cada ingresso (D-12): gravado na mesma transação da operação (lote do db.batch ou CTE do mesmo comando),
 * para nunca existir a operação sem o registro nem o registro sem a operação. Leitura só na central
 * (src/lib/admin-trail.ts).
 */

export type TicketEventKind =
  | "emitido" | "presente" | "presente_aceito"
  | "transferencia_enviada" | "transferencia_reenviada" | "transferencia_aceita" | "transferencia_cancelada"
  | "revenda_vendida" | "reembolso" | "cancelado" | "checkin" | "checkin_recusado";

export type TicketEventRow = Omit<typeof schema.ticketEvents.$inferInsert, "kind"> & { kind: TicketEventKind };

/** Comando de inserção para ir no mesmo lote (runBatch) da operação. */
export const trailInsert = (rows: TicketEventRow[]) => db.insert(schema.ticketEvents).values(rows);

/** Texto curto (coluna note tem 200 caracteres). */
export const trailNote = (s: string | null | undefined) => (s ? s.replace(/\s+/g, " ").trim().slice(0, 200) : null);
