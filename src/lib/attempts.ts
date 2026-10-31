import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { abortOf, ensure, lockKeys, runBatch } from "@/lib/payments/tx";

/*
 * Contador de tentativas ATÔMICO, contado ANTES de conferir o palpite (SEC-301).
 *
 * O KV da Cloudflare não serve para isso: é eventualmente consistente, aceita 1 escrita por segundo por chave e não
 * tem incremento atômico, então pedidos simultâneos liam o mesmo contador e todos conferiam o palpite (20 palpites
 * passavam num limite de 5). Aqui cada tentativa é uma linha em `security_events` (tipo "try:<balde>"), gravada numa
 * transação com trava por balde (pg_advisory_xact_lock) e a contagem conferida na mesma transação: com N pedidos ao
 * mesmo tempo, exatamente `max` passam. Sem tabela nova (nada a aplicar na produção antes do código).
 *
 * Falha fechada: erro do banco vira exceção; quem chama recusa a tentativa.
 * `subject`: a conta (id) ou uma chave sem dado pessoal em claro (ex.: "email:<hash>", "ip:<ip>").
 * As linhas "try:" não aparecem no histórico de segurança da conta (listSecurityEvents filtra) e são podadas depois
 * de um dia, por balde (servem de rastro para investigar abuso nesse intervalo).
 */

const KIND = (bucket: string) => `try:${bucket}`.slice(0, 32);
const KEEP_SEC = 86_400;

export type Attempt = { ok: true; n: number } | { ok: false };

/** Reserva uma tentativa no balde; `n` é a posição dela na janela (1 = primeira). Recusa quando passaria de `max`. */
export async function reserveAttempt(subject: string, bucket: string, max: number, windowSec: number, meta?: { ip?: string | null; ua?: string | null }): Promise<Attempt> {
  const kind = KIND(bucket);
  const { securityEvents: t } = schema;
  const inWindow = sql`${t.userId} = ${subject} and ${t.kind} = ${kind} and ${t.createdAt} > now() - make_interval(secs => ${windowSec})`;
  try {
    const res = await runBatch([
      lockKeys([`try:${subject}:${kind}`]),
      db.delete(t).where(and(eq(t.userId, subject), eq(t.kind, kind), sql`${t.createdAt} < now() - make_interval(secs => ${Math.max(KEEP_SEC, windowSec)})`)),
      db.insert(t).values({ userId: subject, kind, ip: meta?.ip?.slice(0, 64) ?? null, userAgent: meta?.ua?.slice(0, 300) ?? null }),
      ensure(sql`(select count(*) from ${t} where ${inWindow}) <= ${max}`, "tries"),
      db.execute(sql`select count(*)::int as n from ${t} where ${inWindow}`),
    ]);
    const rows = (res[4] as { rows?: { n: number }[] }).rows ?? (res[4] as unknown as { n: number }[]);
    return { ok: true, n: Number(rows[0]?.n ?? max) };
  } catch (e) {
    if (abortOf(e) === "tries") return { ok: false };
    throw e;
  }
}

/** Zera o balde (ex.: código certo). */
export async function clearAttempts(subject: string, bucket: string) {
  const { securityEvents: t } = schema;
  await db.delete(t).where(and(eq(t.userId, subject), eq(t.kind, KIND(bucket))));
}

/** Prefixo dos tipos de tentativa em security_events (fora do histórico que a pessoa vê). */
export const ATTEMPT_KIND_PREFIX = "try:";
