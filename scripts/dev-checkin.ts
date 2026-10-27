/* Testa o POST /api/checkin com o payload real de um ingresso.
   Rode com: pnpm tsx --env-file=.env.local scripts/dev-checkin.ts <code> [base=http://localhost:3000] */
import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");
const db = drizzle(neon(url), { schema });

const [code, base = "http://localhost:3000"] = process.argv.slice(2);
if (!code) { console.error("uso: tsx --env-file=.env.local scripts/dev-checkin.ts <code> [base]"); process.exit(1); }

// mesmo algoritmo de qrPayload em src/lib/actions/tickets.ts
function payload(c: string, secret: string) {
  const sig = createHmac("sha256", process.env.NEON_AUTH_COOKIE_SECRET ?? "onde").update(`${c}:${secret}`).digest("base64url").slice(0, 16);
  return `ONDE|${c}|${sig}`;
}

async function post(p: string) {
  const r = await fetch(`${base}/api/checkin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: p }) });
  console.log(r.status, JSON.stringify(await r.json()));
}

async function main() {
  const t = await db.query.tickets.findFirst({ where: eq(schema.tickets.code, code.toUpperCase()) });
  if (!t) throw new Error("ingresso não encontrado");
  const good = payload(t.code, t.secret);
  console.log("payload:", good);
  console.log("1) assinatura errada →"); await post(`ONDE|${t.code}|AAAAAAAAAAAAAAAA`);
  console.log("2) check-in →"); await post(good);
  console.log("3) de novo (já utilizado) →"); await post(good);
  console.log("4) formato inválido →"); await post("lixo");
}

main().catch((err) => { console.error(err); process.exit(1); });
