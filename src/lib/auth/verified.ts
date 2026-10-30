import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/*
 * Conta com e-mail ainda não ativado (código do cadastro não digitado).
 * Pode: navegar, comprar (inclusive em grupo e na revenda), ver e transferir os próprios ingressos.
 * Não pode até ativar: receber ingresso enviado para o e-mail, entrar na equipe de um produtor por convite,
 * a central, e virar produtor (enviar a inscrição e montar a página do produtor depois da aprovação).
 * Motivo: quem vende ingresso recebe dinheiro e responde por pedidos; o e-mail precisa ser de quem criou a conta.
 * Quem já era produtor antes desta regra continua liberado (há produtores antigos sem o e-mail confirmado; decisão
 * de exigir a ativação deles em pending-decisions.md).
 */

export const ACTIVATE_PRODUCER = "Confirme seu e-mail antes de continuar: digite o código que enviamos na página Ativar conta.";

/** Endereço da ativação que volta para `next` depois do código. */
export const activateHref = (next: string) => `/ativar-conta?next=${encodeURIComponent(next)}`;

/**
 * E-mail confirmado? A sessão guarda uma cópia do usuário por alguns minutos; quando ela diz "não", confere no banco
 * do login, para quem acabou de ativar não ficar preso na página de ativação.
 */
export async function emailConfirmed(user: { id: string; emailVerified?: boolean | null }): Promise<boolean> {
  if (user.emailVerified) return true;
  if (!/^[0-9a-f-]{36}$/i.test(user.id)) return false;
  const r = await db.execute<{ v: boolean }>(sql`select "emailVerified" v from neon_auth."user" where id = ${user.id}`);
  return !!r.rows[0]?.v;
}
