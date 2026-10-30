import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";

/*
 * Transação em lote (db.batch): o driver HTTP do Neon não tem transação interativa, mas manda vários comandos
 * juntos e o banco desfaz todos se um falhar. Usado na emissão, no reembolso e no saque: ou tudo é gravado,
 * ou nada é (uma queda do Worker no meio não deixa estoque, ingresso, saldo ou pedido pela metade).
 *
 * Conferências que dependem do que já foi gravado viram comandos `ensure` dentro do lote: quando não passam,
 * provocam um erro proposital (TW_ABORT:<motivo>) que desfaz o lote inteiro e diz o motivo.
 */
const ABORT = "TW_ABORT:";

/** Aborta a transação quando `ok` é falso. `clock_timestamp()` impede o Postgres de avaliar o erro antes da hora. */
export const ensure = (ok: SQL, why: string, withClause?: SQL) =>
  db.execute(sql`${withClause ?? sql``} select case when ${ok} then 0 else (${`${ABORT}${why}:`} || clock_timestamp()::text)::int end`);

/** O motivo de um `ensure` que abortou a transação (ou null se a falha foi outra: rede, banco). */
export function abortOf(e: unknown): string | null {
  let x: unknown = e;
  for (let i = 0; x && i < 4; i++) {
    const m = /TW_ABORT:(\w+):/.exec(String((x as { message?: unknown }).message ?? ""));
    if (m) return m[1];
    x = (x as { cause?: unknown }).cause;
  }
  return null;
}

export const runBatch = (list: BatchItem<"pg">[]) => db.batch(list as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

/** Trava até o fim da transação, por chave de texto (mesma chave = um de cada vez). Ordem fixa evita impasse. */
export const lockKeys = (keys: string[]) => db.execute(sql`
  select pg_advisory_xact_lock(k) from (
    select distinct hashtextextended(x, 0) as k from unnest(array[${sql.join(keys.map((k) => sql`${k}`), sql`, `)}]::text[]) as x
  ) s order by k`);
