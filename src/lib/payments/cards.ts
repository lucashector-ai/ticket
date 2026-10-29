import "server-only";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { stripe, stripeEnabled } from "@/lib/payments/stripe";

/*
 * Cartões salvos ("como no Claude"): cada conta da Tickets Win tem um cliente no processador de pagamentos,
 * criado só quando a pessoa pede para salvar um cartão. Os dados do cartão ficam lá; aqui guardamos apenas
 * o id do cliente (user_profiles.stripe_customer_id). Quem lista, usa ou remove um cartão é sempre conferido
 * pelo servidor: o cliente vem do perfil de quem está logado, nunca do navegador.
 */

const { userProfiles } = schema;

/** O que a tela mostra de um cartão salvo (nunca o número inteiro). */
export type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  /** nome do titular gravado com o cartão */
  holder: string;
  isDefault: boolean;
  expired: boolean;
};

const BRANDS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "Amex", american_express: "Amex", elo: "Elo", hipercard: "Hipercard",
  diners: "Diners", discover: "Discover", jcb: "JCB", unionpay: "UnionPay", cartes_bancaires: "CB",
};
export const brandLabel = (b: string | null | undefined) => (b && BRANDS[b.toLowerCase()]) || "Cartão";

const isMissing = (e: unknown) => (e as { code?: string })?.code === "resource_missing";

/** Id do cliente gravado no perfil (sem chamar o processador). */
export async function storedCustomerId(userId: string) {
  const p = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId), columns: { stripeCustomerId: true } });
  return p?.stripeCustomerId ?? null;
}

/**
 * Cliente da conta no processador, criado na primeira vez (chave de idempotência por conta, para duas abas
 * não criarem dois). Se o cliente gravado não existe mais (apagado ou chaves trocadas de teste para produção),
 * cria outro.
 */
export async function ensureCustomer(user: { id: string; email?: string | null; name?: string | null }): Promise<string> {
  const s = stripe();
  const cur = await storedCustomerId(user.id);
  if (cur) {
    try {
      const c = await s.customers.retrieve(cur);
      if (!("deleted" in c && c.deleted)) return cur;
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
  }
  const c = await s.customers.create(
    { email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `user-${user.id}-customer${cur ? `-after-${cur}` : ""}` },
  );
  // grava sem sobrescrever outro que tenha chegado antes (duas abas); se chegou, fica o que já estava
  await db.insert(userProfiles).values({ userId: user.id, email: user.email ?? null, stripeCustomerId: c.id })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { stripeCustomerId: cur ? c.id : sql`coalesce(${userProfiles.stripeCustomerId}, excluded.stripe_customer_id)` },
    });
  return (await storedCustomerId(user.id)) ?? c.id;
}

function view(pm: Stripe.PaymentMethod, defaultId: string | null): SavedCard | null {
  const c = pm.card;
  if (!c) return null;
  const now = new Date();
  const expired = c.exp_year < now.getFullYear() || (c.exp_year === now.getFullYear() && c.exp_month < now.getMonth() + 1);
  return {
    id: pm.id, brand: brandLabel(c.display_brand ?? c.brand), last4: c.last4, expMonth: c.exp_month, expYear: c.exp_year,
    holder: (pm.billing_details?.name ?? "").trim(), isDefault: pm.id === defaultId, expired,
  };
}

/** Cartões do cliente (sem repetidos: o mesmo cartão salvo duas vezes aparece uma vez, o mais recente). */
export async function listCustomerCards(customerId: string): Promise<{ cards: SavedCard[]; all: Stripe.PaymentMethod[] }> {
  const s = stripe();
  try {
    const [list, cus] = await Promise.all([
      s.paymentMethods.list({ customer: customerId, type: "card", limit: 50 }),
      s.customers.retrieve(customerId),
    ]);
    const def = "deleted" in cus && cus.deleted ? null : (() => {
      const d = (cus as Stripe.Customer).invoice_settings?.default_payment_method;
      return typeof d === "string" ? d : d?.id ?? null;
    })();
    const seen = new Set<string>();
    const cards: SavedCard[] = [];
    // a lista vem do mais novo para o mais antigo
    for (const pm of list.data) {
      const fp = pm.card?.fingerprint ?? pm.id;
      if (seen.has(fp)) continue;
      seen.add(fp);
      const v = view(pm, def);
      if (v) cards.push(v);
    }
    // padrão primeiro, depois os válidos, depois os vencidos
    cards.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(a.expired) - Number(b.expired));
    return { cards, all: list.data };
  } catch (e) {
    if (isMissing(e)) return { cards: [], all: [] };
    throw e;
  }
}

/** Cartões salvos de uma conta; [] sem processador configurado ou sem cliente. */
export async function cardsOf(userId: string): Promise<SavedCard[]> {
  if (!stripeEnabled()) return [];
  const cus = await storedCustomerId(userId);
  if (!cus) return [];
  return (await listCustomerCards(cus)).cards;
}

/**
 * Cartão salvo que pertence a esta conta (o PaymentMethod está ligado ao cliente da conta), ou null.
 * Nunca confia em id de cliente vindo do navegador.
 */
export async function ownCard(userId: string, paymentMethodId: string): Promise<{ pm: Stripe.PaymentMethod; customerId: string } | null> {
  const cus = await storedCustomerId(userId);
  if (!cus) return null;
  try {
    const pm = await stripe().paymentMethods.retrieve(paymentMethodId);
    const owner = typeof pm.customer === "string" ? pm.customer : pm.customer?.id ?? null;
    if (pm.type !== "card" || owner !== cus) return null;
    return { pm, customerId: cus };
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}
