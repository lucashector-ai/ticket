"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cpfValid } from "@/lib/cpf";
import { normalizePhone, phoneValid } from "@/lib/phone";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { priceOrder, SERVICE_FEE_RATE } from "@/lib/pricing";
import { tierStatus } from "@/lib/tickets/status";
import { canBuy } from "@/lib/launch";
import { promoterForOrder } from "@/lib/promoters";
import { queueAllows } from "@/lib/queue";
import { heldByType, overbooked } from "@/lib/holds";
import { claimSpecial, lookupSpecial } from "@/lib/special";
import { boughtByType, fulfillOrder, overLimit, type FulfillResult } from "@/lib/payments/fulfill";
import { startPix, STRIPE_MIN_BRL_CENTS } from "@/lib/payments/intents";
import { releaseOthers } from "@/lib/payments/pending";
import { testPix } from "@/lib/payments/pix-test";
import { stripeEnabled } from "@/lib/payments/stripe";
import { addHit, allowHit, clientIp, limitReached } from "@/lib/rate-limit";

const { orders, orderItems, coupons, events, userProfiles } = schema;

const digits = (v: string) => v.replace(/\D/g, "");
const fullName = z.string().trim().refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "nome e sobrenome");

const placeSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(z.object({ ticketTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(8) })).min(1),
  coupon: z.string().trim().toUpperCase().optional().nullable(),
  buyer: z.object({
    name: fullName,
    email: z.string().trim().email("e-mail"),
    phone: z.string().transform(normalizePhone).refine(phoneValid, "celular com DDD"),
    cpf: z.string().refine(cpfValid, "CPF válido (obrigatório)"),
  }),
  /**
   * `me`: o ingresso é do próprio comprador (fica na conta dele). Os outros vão por e-mail para quem vai usar
   * depois do pagamento: a pessoa entra (ou cria a conta) com esse e-mail e aceita.
   */
  holders: z.array(z.object({
    ticketTypeId: z.string().uuid(), name: fullName, meia: z.boolean(),
    me: z.boolean().optional().default(false),
    email: z.string().trim().toLowerCase().max(254).email("e-mail válido de quem vai receber cada ingresso").optional().nullable().or(z.literal("")),
  })),
  /** "free": pedido de valor zero (ingresso grátis ou cupom de 100%), confirmado sem pagamento */
  method: z.enum(["pix", "card", "free"]),
  installments: z.number().int().min(1).max(6),
  /** parte de uma compra em grupo / anúncio da revenda (1 ingresso, preço travado) */
  groupShareId: z.string().uuid().optional().nullable(),
  resaleListingId: z.string().uuid().optional().nullable(),
});
export type PlaceOrderInput = z.infer<typeof placeSchema>;

/** `live`: cobrança de verdade pela Stripe; senão, modo de teste. No Pix vêm o copia e cola e o QR. */
export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; totalCents: number; live: boolean; pixCode: string; pixQrSvg: string; expiresAt: string | null; hostedUrl: string | null }
  | { ok: false; error: string; needsLogin?: boolean };

async function findCoupon(code: string, eventId: string) {
  const c = await db.query.coupons.findFirst({ where: and(eq(coupons.code, code), eq(coupons.active, true)) });
  if (!c) return { ok: false as const, error: "Cupom inválido ou expirado." };
  if (c.expiresAt && c.expiresAt < new Date()) return { ok: false as const, error: "Cupom expirado." };
  if (c.maxUses != null && c.uses >= c.maxUses) return { ok: false as const, error: "Cupom esgotado." };
  if (c.eventId && c.eventId !== eventId) return { ok: false as const, error: "Cupom não vale para este evento." };
  return { ok: true as const, coupon: c };
}

/** pedidos por conta a cada 10 min (trocar a forma de pagamento cria outro; uso normal fica bem abaixo) */
const ORDERS_PER_10MIN = 12;

/** cupons errados por IP a cada 10 min (sem login): impede descobrir códigos chutando. Só os errados contam:
 *  um link de e-mail com o cupom aberto por muita gente na mesma rede (CGNAT do celular) não é bloqueado. */
const COUPON_MISSES = 20;

/** Confere um cupom para o resumo do checkout (não exige login). */
export async function checkCoupon(code: string, eventSlug: string) {
  if (typeof code !== "string" || typeof eventSlug !== "string" || code.length > 60) return { ok: false as const, error: "Cupom inválido ou expirado." };
  const key = `cupom:${await clientIp()}`;
  if (await limitReached(key, COUPON_MISSES)) return { ok: false as const, error: "Muitas tentativas de cupom. Espere alguns minutos e tente de novo." };
  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), columns: { id: true } });
  if (!ev) return { ok: false as const, error: "Evento indisponível." };
  const r = await findCoupon(code.trim().toUpperCase(), ev.id);
  if (!r.ok) { await addHit(key, 600); return r; }
  return couponView(r.coupon);
}

function couponView(c: typeof coupons.$inferSelect) {
  return { ok: true as const, code: c.code, percentOff: c.percentOff ?? 0, amountOffCents: c.amountOffCents ?? 0, amountPerTicket: c.amountPerTicket, sector: c.sector };
}

/**
 * Titulares: no máximo um "Sou eu"; cada ingresso de outra pessoa precisa de um e-mail (que não seja o do
 * comprador) e um mesmo e-mail não recebe mais ingressos de um tipo do que o limite por pessoa.
 */
function checkHolders(holders: PlaceOrderInput["holders"], own: string[], limits: Map<string, { name: string; max: number }>): string | null {
  if (holders.filter((h) => h.me).length > 1) return "Só um dos ingressos pode ser o seu (“Sou eu”).";
  const perEmail = new Map<string, number>();
  for (const h of holders) {
    if (h.me) continue;
    const email = (h.email ?? "").trim().toLowerCase();
    if (!email) return "Falta preencher: e-mail de quem vai receber cada ingresso.";
    if (own.includes(email)) return "Esse é o seu e-mail. Para o seu próprio ingresso, use “Sou eu”.";
    const k = `${email}|${h.ticketTypeId}`;
    const n = (perEmail.get(k) ?? 0) + 1;
    perEmail.set(k, n);
    const lim = limits.get(h.ticketTypeId);
    if (lim && n > lim.max) return `O limite é ${lim.max} ${lim.max === 1 ? "ingresso" : "ingressos"} de ${lim.name} por pessoa: ${email} está recebendo ${n}.`;
  }
  return null;
}

/** Cria o pedido com os dados do checkout. Exige login (pedido na etapa Dados). */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta para finalizar a compra.", needsLogin: true };
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    const missing = Array.from(new Set(parsed.error.issues.map((i) => i.message)));
    return { ok: false, error: `Falta preencher: ${missing.join(", ")}.` };
  }
  const { eventSlug, items, buyer, holders, method, installments, groupShareId, resaleListingId } = parsed.data;
  let { coupon } = parsed.data;

  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), with: { ticketTypes: true } });
  if (!ev || ev.status !== "published") return { ok: false, error: "Evento indisponível." };

  // parte de grupo ou revenda: 1 ingresso, preço travado, sem cupom nem meia; não passa por abertura/fila
  const sp = groupShareId || resaleListingId ? await lookupSpecial(ev.id, { groupShareId, resaleListingId }, user.id) : null;
  if (sp && !sp.ok) return { ok: false, error: sp.error };
  const special = sp?.ok ? sp.s : null;
  let presaleSignupId: string | null = null;
  const lines = [];
  if (special) {
    const tt = ev.ticketTypes.find((t) => t.id === special.ticketTypeId);
    if (!tt || holders.length !== 1 || holders[0].ticketTypeId !== tt.id) return { ok: false, error: "Informe o titular do ingresso." };
    if (!(await claimSpecial(special, user.id, holders[0].name.trim()))) return { ok: false, error: "Outra pessoa acabou de pegar este ingresso. Tente outro." };
    lines.push({ ticketTypeId: tt.id, priceCents: special.priceCents, quantity: 1, sector: tt.sector, meiaOk: false });
    coupon = null;
  } else {
    const access = await canBuy(ev);
    if (!(await queueAllows(ev))) return { ok: false, error: "Você está na fila virtual. Volte à página do evento e aguarde a sua vez." };
    if (!access.ok) return { ok: false, error: access.phase === "presale" ? "A pré-venda é só para quem recebeu o link. A venda geral abre em breve." : "As vendas deste evento ainda não abriram." };
    presaleSignupId = access.presaleSignupId;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    if (totalQty > ev.maxPerOrder) return { ok: false, error: `Máximo de ${ev.maxPerOrder} ingressos por compra, somando todos os tipos.` };
    if (holders.length !== totalQty) return { ok: false, error: "Informe o titular de cada ingresso." };
    const limitErr = overLimit(items, ev.ticketTypes, await boughtByType(user.id, digits(buyer.cpf), items.map((i) => i.ticketTypeId)));
    if (limitErr) return { ok: false, error: limitErr };
    // vagas de grupos e reservas de outras pessoas (os pedidos abertos desta conta são liberados abaixo)
    const held = await heldByType(ev.id, { exceptUserId: user.id });
    for (const it of items) {
      const tt = ev.ticketTypes.find((t) => t.id === it.ticketTypeId);
      if (!tt || tierStatus(tt) !== "open") return { ok: false, error: "Um dos lotes não está mais disponível." };
      const left = tt.quantity - tt.sold - (held.get(tt.id) ?? 0);
      if (it.quantity > left) return { ok: false, error: `Restam só ${Math.max(0, left)} ingressos em ${tt.name}.` };
      const forType = holders.filter((h) => h.ticketTypeId === tt.id).length;
      if (forType !== it.quantity) return { ok: false, error: "Informe o titular de cada ingresso." };
      lines.push({ ticketTypeId: tt.id, priceCents: tt.priceCents, quantity: it.quantity, sector: tt.sector, meiaOk: (!tt.kind || tt.kind === "inteira") && tt.priceCents > 0 });
    }
  }
  const own = [buyer.email, user.email ?? ""].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const limits = new Map(ev.ticketTypes.map((t) => [t.id, { name: t.name, max: special ? 1 : Math.min(t.maxPerOrder, ev.maxPerOrder) }]));
  const holderErr = checkHolders(holders, own, limits);
  if (holderErr) return { ok: false, error: holderErr };
  // meia só onde o checkout oferece (tipos de inteira); meia/social já têm preço próprio
  const meiaOk = new Map(lines.map((l) => [l.ticketTypeId, l.meiaOk]));
  const cleanHolders = holders.map((h) => ({
    ticketTypeId: h.ticketTypeId, name: h.name.trim(), meia: h.meia && meiaOk.get(h.ticketTypeId) !== false,
    me: !!h.me, email: h.me ? null : (h.email ?? "").trim().toLowerCase() || null,
  }));

  let couponRow: typeof coupons.$inferSelect | null = null;
  if (coupon) {
    const c = await findCoupon(coupon, ev.id);
    if (!c.ok) return { ok: false, error: c.error };
    couponRow = c.coupon;
  }
  const feeRate = ev.absorbFee ? 0 : SERVICE_FEE_RATE;
  const p = priceOrder({ lines, holders: cleanHolders, coupon: couponRow ? couponView(couponRow) : null, method: method === "card" ? "card" : "pix", installments, feeRate });
  if (method === "free" && p.total > 0) return { ok: false, error: "Este pedido tem valor a pagar. Escolha Pix ou cartão." };
  const free = p.total === 0;
  const live = stripeEnabled();
  if (live && !free && p.total < STRIPE_MIN_BRL_CENTS) return { ok: false, error: "O valor mínimo para pagamento online é R$ 0,50." };
  // cada pedido segura os ingressos por 15 min: criar pedidos em sequência viraria um jeito de travar o estoque
  // (conta só pedido criado de verdade; erro de preenchimento não gasta a cota)
  if (!(await allowHit(`pedido:${user.id}`, ORDERS_PER_10MIN, 600))) return { ok: false, error: "Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo." };
  // um pedido aberto por evento: o anterior (recarregou, voltou, trocou a forma de pagamento) é liberado
  const released = await releaseOthers(user.id, ev.id, { groupShareId: special?.kind === "grupo" ? special.shareId : null, resaleListingId: special?.kind === "revenda" ? special.listingId : null });
  if (!released.ok) return { ok: false, error: released.error };
  // comissão do parceiro: % do valor dos ingressos (sem taxa e sem juros)
  const promoter = special?.kind === "revenda" ? null : await promoterForOrder(ev);

  const [order] = await db.insert(orders).values({
    userId: user.id, eventId: ev.id, status: "pending",
    subtotalCents: p.subtotal, meiaCents: p.meia, discountCents: p.discount, feeCents: p.fee,
    interestCents: p.interest, installments: p.installments, totalCents: p.total,
    couponId: couponRow?.id ?? null, paymentMethod: free ? "free" : method,
    buyerName: buyer.name.trim(), buyerEmail: buyer.email.trim().toLowerCase(), buyerPhone: buyer.phone, buyerCpf: digits(buyer.cpf),
    holders: cleanHolders,
    expiresAt: new Date(Date.now() + 15 * 60_000),
    presaleSignupId,
    groupShareId: special?.kind === "grupo" ? special.shareId : null,
    resaleListingId: special?.kind === "revenda" ? special.listingId : null,
    promoterId: promoter?.id ?? null,
    commissionCents: promoter ? Math.round(((p.subtotal - p.meia - p.discount) * promoter.commissionPct) / 100) : 0,
  }).returning();
  await db.insert(orderItems).values(lines.map((l) => ({
    orderId: order.id, ticketTypeId: l.ticketTypeId, quantity: l.quantity, unitPriceCents: l.priceCents,
    unitFeeCents: Math.round(l.priceCents * feeRate),
  })));
  // a reserva vale a partir daqui: se outra pessoa reservou os mesmos últimos lugares no mesmo instante, este
  // pedido sai antes de gerar Pix ou cobrar (melhor do que cobrar e estornar depois)
  if (!special && (await overbooked(ev.id, lines.map((l) => l.ticketTypeId))).length) {
    await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
    return { ok: false, error: "Outra pessoa acabou de reservar os últimos ingressos deste tipo. Confira o que ainda resta e tente de novo." };
  }

  // guarda celular e CPF no perfil para preencher da próxima vez
  await db.insert(userProfiles).values({ userId: user.id, name: buyer.name.trim(), email: user.email ?? buyer.email, phone: buyer.phone, cpf: digits(buyer.cpf) })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { name: buyer.name.trim(), phone: buyer.phone, cpf: digits(buyer.cpf) } });

  const number = order.number ?? 0;
  if (method === "pix" && !free) {
    if (live) {
      // Pix de verdade: a Stripe gera o copia e cola; mostramos o QR dentro do checkout
      const px = await startPix(order);
      if (!px.ok) {
        await db.update(orders).set({ status: "cancelled" }).where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
        return { ok: false, error: px.error };
      }
      return { ok: true, orderId: order.id, number, totalCents: p.total, live: true, ...px.pix };
    }
    const { pixCode, pixQrSvg } = await testPix(number, p.total);
    return { ok: true, orderId: order.id, number, totalCents: p.total, live: false, pixCode, pixQrSvg, expiresAt: order.expiresAt?.toISOString() ?? null, hostedUrl: null };
  }
  return { ok: true, orderId: order.id, number, totalCents: p.total, live, pixCode: "", pixQrSvg: "", expiresAt: order.expiresAt?.toISOString() ?? null, hostedUrl: null };
}

export type ConfirmResult = FulfillResult;

/**
 * Confirma um pedido SEM gateway: pedido grátis (sempre) ou o modo de teste (só quando a Stripe NÃO está
 * configurada; a referência fica TEST-…, que não entra no saldo do produtor). Com a Stripe ligada, pedido
 * com valor só é confirmado pelo pagamento de verdade (webhook ou checkPayment).
 */
export async function confirmPayment(orderId: string): Promise<ConfirmResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Pedido não encontrado." };
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)), columns: { id: true, number: true, totalCents: true, status: true } });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  const free = order.totalCents === 0;
  if (!free && stripeEnabled() && order.status !== "paid") return { ok: false, error: "Finalize o pagamento para confirmar o pedido." };
  return fulfillOrder(order.id, { ref: `${free ? "FREE" : "TEST"}-${order.number}`, charged: false });
}

