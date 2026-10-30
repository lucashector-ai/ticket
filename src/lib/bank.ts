import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";
import type { OrganizerPayout } from "@/db/schema";
import { getPainelScope, orderSums, platformFee } from "@/lib/data/painel";
import { signingSecret } from "@/lib/signing-secret";

/*
 * Banco Tickets Win: a carteira do dono dos eventos.
 * Cada venda paga (sem as de teste e sem a revenda) entra como "a liberar" e fica disponível
 * RELEASE_DAYS dias depois do fim do evento. Disponível = liberado − reembolsos − saques pedidos/pagos.
 * Reembolso (order_refunds.producer_cents) sai na hora do mesmo grupo da venda: se o dinheiro já tinha
 * sido sacado, o saldo fica negativo (é descontado das próximas vendas, e não dá para sacar enquanto isso).
 * Evento cancelado nunca libera: o valor fica retido até os reembolsos terminarem.
 * O acesso é separado do site: subdomínio próprio, senha própria e código por e-mail.
 */

export const RELEASE_DAYS = 2;
export const MIN_PAYOUT = 1000;
const ACTIVE = ["requested", "processing", "paid"] as const;

export type BankEntry = {
  id: string; at: string; kind: "venda" | "saque" | "reembolso"; title: string; detail: string; amount: number;
  status: "liberado" | "a liberar" | "retido" | "requested" | "processing" | "paid" | "rejected" | "cancelled"; releaseAt?: string;
};

const spDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Saldo, extrato e destino do repasse de quem é dono dos eventos. `null` se a pessoa não é dona de nada. */
export async function walletFor(userId: string) {
  const scope = await getPainelScope({ id: userId });
  if (scope.role !== "owner") return null;
  const evs = scope.events.filter((e) => e.status !== "draft");
  const byId = new Map(evs.map((e) => [e.id, e]));
  const evIds = evs.map((e) => e.id);
  const refunds = evIds.length ? await db.select({
    orderId: schema.orderRefunds.orderId, eventId: schema.orderRefunds.eventId, cents: schema.orderRefunds.producerCents, at: schema.orderRefunds.createdAt,
  }).from(schema.orderRefunds).where(and(
    inArray(schema.orderRefunds.eventId, evIds), inArray(schema.orderRefunds.status, ["pending", "succeeded"]),
    eq(schema.orderRefunds.test, false), sql`${schema.orderRefunds.producerCents} > 0`,
  )) : [];
  // vendas somadas no banco (por evento, dia e valor), sem trazer os pedidos um a um.
  // pedido reembolsado entra como venda + reembolso; os antigos, sem trilha, simplesmente não entram (como antes)
  const sums = (await orderSums(evIds)).filter((s) => s.status === "paid" || s.trail);
  const netOf = (s: (typeof sums)[number]) => s.revenue - platformFee(s.revenue, byId.get(s.eventId)?.absorbFee ?? false);
  // venda de teste (sem gateway: payment_ref TEST-… ou método "test") nunca vira saldo sacável
  const real = sums.filter((s) => !s.test && netOf(s) > 0);
  const now = Date.now();

  const releaseOf = (eventId: string) => {
    const e = byId.get(eventId)!;
    // evento cancelado: o dinheiro fica retido até o fim dos reembolsos (nunca libera para saque)
    if (e.status === "cancelled") return new Date(8.64e15);
    return new Date((e.endAt ?? e.startAt).getTime() + RELEASE_DAYS * 864e5);
  };
  const stOf = (eventId: string): BankEntry["status"] => byId.get(eventId)!.status === "cancelled" ? "retido" : releaseOf(eventId).getTime() <= now ? "liberado" : "a liberar";

  // vendas agrupadas por evento e dia (no fuso de São Paulo)
  const groups = new Map<string, { eventId: string; day: string; at: Date; net: number; n: number; qty: number }>();
  for (const s of real) {
    const k = `${s.eventId}:${s.day}`;
    const g = groups.get(k) ?? { eventId: s.eventId, day: s.day, at: s.at, net: 0, n: 0, qty: 0 };
    g.net += netOf(s) * s.n; g.n += s.n; g.qty += s.qty;
    if (s.at > g.at) g.at = s.at;
    groups.set(k, g);
  }
  // reembolsos agrupados por evento e dia
  const rgroups = new Map<string, { eventId: string; at: Date; cents: number; n: number }>();
  for (const r of refunds) {
    if (!byId.has(r.eventId)) continue;
    const k = `${r.eventId}:${spDay(r.at)}`;
    const g = rgroups.get(k) ?? { eventId: r.eventId, at: r.at, cents: 0, n: 0 };
    g.cents += r.cents; g.n += 1;
    if (r.at > g.at) g.at = r.at;
    rgroups.set(k, g);
  }
  const payouts = await db.query.payoutRequests.findMany({ where: eq(schema.payoutRequests.userId, userId), orderBy: [desc(schema.payoutRequests.createdAt)], limit: 200 });

  const entries: BankEntry[] = [
    ...[...groups.values()].map((g): BankEntry => {
      const rel = releaseOf(g.eventId);
      return {
        id: `v:${g.eventId}:${g.day}`, at: g.at.toISOString(), kind: "venda", title: byId.get(g.eventId)!.title,
        detail: `${g.n} ${g.n === 1 ? "pedido" : "pedidos"} · ${g.qty} ${g.qty === 1 ? "ingresso" : "ingressos"}`,
        amount: g.net, status: stOf(g.eventId), releaseAt: rel.toISOString(),
      };
    }),
    ...[...rgroups.entries()].map(([k, g]): BankEntry => ({
      id: `r:${k}`, at: g.at.toISOString(), kind: "reembolso", title: byId.get(g.eventId)!.title,
      detail: `${g.n} ${g.n === 1 ? "reembolso" : "reembolsos"} a compradores`, amount: -g.cents, status: stOf(g.eventId),
    })),
    ...payouts.map((p): BankEntry => ({
      id: `s:${p.id}`, at: p.createdAt.toISOString(), kind: "saque", title: "Saque",
      detail: destLabel(p.destination), amount: -p.amountCents, status: p.status,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const isReleased = (eventId: string) => releaseOf(eventId).getTime() <= now;
  const refundedOut = (rel: boolean) => [...rgroups.values()].filter((g) => isReleased(g.eventId) === rel).reduce((s, g) => s + g.cents, 0);
  const released = [...groups.values()].filter((g) => isReleased(g.eventId)).reduce((s, g) => s + g.net, 0) - refundedOut(true);
  const pending = [...groups.values()].filter((g) => !isReleased(g.eventId)).reduce((s, g) => s + g.net, 0) - refundedOut(false);
  const out = payouts.filter((p) => (ACTIVE as readonly string[]).includes(p.status)).reduce((s, p) => s + p.amountCents, 0);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0);
  const inFlight = payouts.filter((p) => p.status === "requested" || p.status === "processing").reduce((s, p) => s + p.amountCents, 0);
  const next = [...groups.values()].map((g) => releaseOf(g.eventId)).filter((d) => d.getTime() > now && d.getTime() < 8e15).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return {
    org: scope.org, entries, payouts,
    // pode ficar negativo: reembolso de venda já sacada (descontado das próximas vendas)
    available: released - out, pending, paidOut, inFlight, refunded: refunds.reduce((s, r) => s + r.cents, 0),
    nextRelease: next?.toISOString() ?? null,
    testSales: sums.filter((s) => !real.includes(s)).reduce((t, s) => t + s.n, 0),
    destination: (scope.org?.payout ?? null) as OrganizerPayout | null,
  };
}
export type Wallet = NonNullable<Awaited<ReturnType<typeof walletFor>>>;

export function hasDestination(d: OrganizerPayout | null | undefined) {
  return !!(d?.pixKey?.trim() || (d?.bank && d.agency && d.account));
}

/** "Pix •••• 1234" ou "Itaú · ag 0001 · cc ••4321". */
export function destLabel(d: OrganizerPayout | null | undefined) {
  if (!d) return "Conta não informada";
  if (d.pixKey?.trim()) {
    const k = d.pixKey.trim();
    if (k.includes("@")) return `Pix ${k.replace(/^(.)[^@]*(@.*)$/, "$1••••$2")}`;
    const digits = k.replace(/\D/g, "");
    return `Pix ${digits.length >= 8 && digits.length === k.replace(/[\s().+-]/g, "").length ? `•••• ${digits.slice(-4)}` : `${k.slice(0, 4)}••••`}`;
  }
  if (d.bank && d.account) return `${d.bank} · ag ${d.agency ?? ""} · ${d.kind === "poupanca" ? "poupança" : "conta"} ••${d.account.slice(-4)}`;
  return "Conta não informada";
}

/* ============================== senha do banco ============================== */

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64url");
async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}
export async function hashBankPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const it = 100_000;
  return `pbkdf2$${it}$${b64(salt)}$${b64(await derive(password, salt, it))}`;
}
export async function checkBankPassword(password: string, stored: string) {
  const [alg, it, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2" || !it || !salt || !hash) return false;
  const got = Buffer.from(await derive(password, Buffer.from(salt, "base64url"), Number(it)));
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ============================== sessão do banco ============================== */

const SESSION = "tw_banco";
const PENDING = "tw_banco_p";
const SESSION_MIN = 30;
const mac = (s: string) => createHmac("sha256", signingSecret()).update(`banco:${s}`).digest("base64url").slice(0, 32);
const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
const pack = (userId: string, exp: number) => `${userId}.${exp}.${mac(`${userId}:${exp}`)}`;
function unpack(v: string | undefined) {
  const [u, e, m] = v?.split(".") ?? [];
  if (!u || !e || !m || Number(e) < Date.now()) return null;
  const want = mac(`${u}:${e}`);
  return want.length === m.length && timingSafeEqual(Buffer.from(want), Buffer.from(m)) ? u : null;
}

/** Quem está dentro do banco agora (senha + código conferidos nos últimos 30 minutos). */
export async function bankUserId() {
  return unpack((await cookies()).get(SESSION)?.value);
}
/** Passou na senha, falta o código. */
export async function bankPendingUserId() {
  return unpack((await cookies()).get(PENDING)?.value);
}
export async function setBankPending(userId: string) {
  (await cookies()).set(PENDING, pack(userId, Date.now() + 10 * 60e3), { ...opts, maxAge: 600 });
}
export async function openBankSession(userId: string) {
  const c = await cookies();
  c.delete(PENDING);
  c.set(SESSION, pack(userId, Date.now() + SESSION_MIN * 60e3), { ...opts, maxAge: SESSION_MIN * 60 });
}
/* criar/recuperar o acesso: cada etapa vencida fica num cookie assinado (15 min): e-mail confirmado → app autenticador → senha */
const SETUP = "tw_banco_c";
export type SetupStage = "email" | "totp";
export async function setBankSetup(userId: string, stage: SetupStage) {
  const exp = Date.now() + 15 * 60e3;
  (await cookies()).set(SETUP, `${userId}.${stage}.${exp}.${mac(`setup:${userId}:${stage}:${exp}`)}`, { ...opts, maxAge: 900 });
}
export async function bankSetup(): Promise<{ userId: string; stage: SetupStage } | null> {
  const [u, st, e, m] = (await cookies()).get(SETUP)?.value?.split(".") ?? [];
  if (!u || !st || !e || !m || Number(e) < Date.now() || (st !== "email" && st !== "totp")) return null;
  const want = mac(`setup:${u}:${st}:${e}`);
  return want.length === m.length && timingSafeEqual(Buffer.from(want), Buffer.from(m)) ? { userId: u, stage: st } : null;
}
export async function clearBankSetup() {
  (await cookies()).delete(SETUP);
}

export async function closeBankSession() {
  const c = await cookies();
  c.delete(SESSION);
  c.delete(PENDING);
}

/** No subdomínio do banco as rotas não têm o prefixo /banco. */
export async function bankBase() {
  const host = (await headers()).get("host") ?? "";
  return host.startsWith("banco.") ? "" : "/banco";
}

/** Endereço do Banco Tickets Win: o subdomínio (BANK_URL, ex.: https://banco.ticketswin.com.br) ou /banco enquanto ele não existe. */
export function bankUrl() {
  return process.env.BANK_URL || "/banco";
}

export async function bankCredential(userId: string) {
  return (await db.query.bankCredentials.findFirst({ where: eq(schema.bankCredentials.userId, userId) })) ?? null;
}

/** Dono de eventos por e-mail (tabela de login do Neon Auth, com o perfil como reserva). */
export async function ownerByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> {
  const e = email.trim().toLowerCase();
  try {
    const r = await db.execute<{ id: string; email: string; name: string | null }>(sql`select id, email, name from neon_auth."user" where lower(email) = ${e} limit 1`);
    if (r.rows[0]) return { id: r.rows[0].id, email: r.rows[0].email, name: r.rows[0].name ?? "" };
  } catch { /* ramo de dev sem o schema do Neon Auth */ }
  const p = await db.query.userProfiles.findFirst({ where: sql`lower(${schema.userProfiles.email}) = ${e}` });
  return p ? { id: p.userId, email: p.email ?? e, name: p.name ?? "" } : null;
}

export async function activePayouts(userId: string) {
  return db.query.payoutRequests.findMany({ where: and(eq(schema.payoutRequests.userId, userId), inArray(schema.payoutRequests.status, ["requested", "processing"])) });
}
