import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Diagnóstico do deploy: diz se cada configuração está presente e válida, sem expor valores. */
export async function GET() {
  const env = process.env;
  const dbUrl = env.DATABASE_URL ?? "";
  const checks: Record<string, unknown> = {
    DATABASE_URL: describeUrl(dbUrl, ["postgres://", "postgresql://"]),
    NEON_AUTH_BASE_URL: describeUrl(env.NEON_AUTH_BASE_URL ?? "", ["https://"]),
    NEON_AUTH_JWKS_URL: describeUrl(env.NEON_AUTH_JWKS_URL ?? "", ["https://"]),
    NEON_AUTH_COOKIE_SECRET: env.NEON_AUTH_COOKIE_SECRET
      ? { presente: true, tamanhoOk: env.NEON_AUTH_COOKIE_SECRET.length >= 32, aspas: /^["']|["']$/.test(env.NEON_AUTH_COOKIE_SECRET) }
      : { presente: false },
  };

  try {
    const rows = await db.execute(sql`select count(*)::int as n from events`);
    checks.banco = { ok: true, eventos: (rows.rows[0] as { n: number }).n };
  } catch (e) {
    checks.banco = { ok: false, erro: errMsg(e) };
  }

  try {
    const { error } = await auth.getSession();
    checks.login = error ? { ok: false, erro: error.message ?? String(error) } : { ok: true };
  } catch (e) {
    checks.login = { ok: false, erro: errMsg(e) };
  }

  return Response.json(checks, { headers: { "cache-control": "no-store" } });
}

function describeUrl(v: string, prefixes: string[]) {
  if (!v) return { presente: false };
  const quoted = /^["']|["']$/.test(v);
  const clean = v.replace(/^["']|["']$/g, "");
  let host: string | null = null;
  try { host = new URL(clean).hostname; } catch {}
  return {
    presente: true,
    formatoOk: prefixes.some((p) => clean.startsWith(p)) && !!host,
    aspas: quoted,
    temNomeJunto: /^[A-Z_]+=/.test(v),
    host,
  };
}

function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  // remove qualquer coisa que pareça senha de connection string
  return m.replace(/\/\/[^@\s]+@/g, "//***@").slice(0, 300);
}
