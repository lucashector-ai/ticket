import "server-only";
import Stripe from "stripe";

/*
 * Stripe (pagamentos de verdade: cartão com parcelamento e Pix), tudo dentro do nosso checkout.
 *
 *   STRIPE_SECRET_KEY       sk_live_... / sk_test_...  (servidor)
 *   STRIPE_PUBLISHABLE_KEY  pk_live_... / pk_test_...  (vai para o navegador como prop, sem NEXT_PUBLIC_)
 *   STRIPE_WEBHOOK_SECRET   whsec_...                  (assinatura do POST /api/webhooks/stripe)
 *
 * Com STRIPE_SECRET_KEY, pedido com valor só vira pago depois que a Stripe confirma.
 * As variáveis são lidas a cada chamada (Workers: os segredos chegam em runtime, não no build).
 *
 * Modo de teste (SEC-100): sem a chave, pedido com valor é confirmado pelo botão "Já fiz o pagamento"
 * (paymentRef TEST-…, nada é cobrado e a venda não entra no saldo sacável, mas o ingresso vale na portaria).
 * Por isso ele NÃO liga sozinho em build de produção: vale só quando testPaymentsAllowed() é verdadeira:
 *
 *   sem STRIPE_SECRET_KEY  E  ( ALLOW_TEST_PAYMENTS=1   OU   não é build de produção )
 *
 *   "build de produção" = NODE_ENV=production (next build / OpenNext). Não olha o endereço do site: as variáveis
 *   NEXT_PUBLIC_* são gravadas no build, e um build feito com o .env.local levaria o endereço de desenvolvimento
 *   para a produção (SEC-402). ALLOW_TEST_PAYMENTS é lida em tempo de execução (variável do Worker).
 *
 * Sem nenhuma das duas, o checkout de evento pago mostra "Pagamento indisponível no momento", placeOrder não
 * reserva e confirmPayment recusa. Ingresso grátis (total zero) não depende disso e continua funcionando.
 * `next dev` e os testes (NODE_ENV development/test) seguem no modo de teste como antes. Para vender em modo de
 * teste num build de produção (decisão do dono, D-SEC-04-1): variável ALLOW_TEST_PAYMENTS=1 no Worker; apagar a
 * variável desliga.
 */

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

/** Este servidor é um build de produção? (SEC-402: decidido só pelo NODE_ENV, nunca pelo endereço gravado no build.) */
export const isProductionSite = () => process.env.NODE_ENV === "production";

/**
 * Pode confirmar pedido com valor sem cobrança (modo de teste)? Ver o comentário do topo (SEC-100).
 * Nunca com a Stripe configurada: aí o pagamento é sempre o de verdade.
 */
export function testPaymentsAllowed() {
  if (stripeEnabled()) return false;
  if (process.env.ALLOW_TEST_PAYMENTS?.trim() === "1") return true;
  return !isProductionSite();
}

/** Há como pagar um pedido com valor agora (Stripe ou modo de teste liberado)? */
export const paymentsAvailable = () => stripeEnabled() || testPaymentsAllowed();

/** Mensagem única quando não há como pagar (sem nome de processador para o comprador). */
export const PAYMENT_UNAVAILABLE = "Pagamento indisponível no momento. Tente de novo mais tarde.";

/** Chave publicável para o Stripe.js; null quando a Stripe não está configurada. */
export function stripePublishableKey() {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  return stripeEnabled() && pk ? pk : null;
}

let client: Stripe | null = null;
let clientKey = "";

/** Cliente da Stripe para Workers (fetch em vez do http do Node). Só chame com stripeEnabled(). */
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
  if (!client || clientKey !== key) {
    client = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "Tickets Win" },
    });
    clientKey = key;
  }
  return client;
}

/** Confere a assinatura do webhook (Web Crypto, sem módulos do Node). */
export async function verifyStripeEvent(raw: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET não configurada");
  if (!signature) throw new Error("sem stripe-signature");
  return stripe().webhooks.constructEventAsync(raw, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
}

/** Pagamento de teste (sem gateway): não é dinheiro de verdade e não pode entrar no saldo do produtor. */
export function isTestPayment(o: { paymentMethod?: string | null; method?: string | null; paymentRef?: string | null; ref?: string | null }) {
  const method = o.paymentMethod ?? o.method;
  const ref = o.paymentRef ?? o.ref ?? "";
  return method === "test" || ref.startsWith("TEST-");
}

/** Referência gravada no pedido pago pela Stripe. */
export const stripeRef = (paymentIntentId: string) => `STRIPE-${paymentIntentId}`;

/** A chave configurada é de produção (cobra de verdade)? Eventos do webhook precisam ser do mesmo modo da chave. */
export const stripeLiveMode = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "");

/** O que a Stripe diz que foi pago num PaymentIntent confirmado (conferido contra o pedido antes de emitir). */
export type PaidAmount = { amountCents: number; currency: string };
export const paidOf = (pi: { amount: number; amount_received?: number | null; currency: string }): PaidAmount => ({
  amountCents: typeof pi.amount_received === "number" && pi.amount_received > 0 ? pi.amount_received : pi.amount,
  currency: pi.currency,
});

/** Mensagens da Stripe em português para quem está comprando. */
export function stripeErrorMessage(e: unknown): string {
  const err = e as { type?: string; code?: string; decline_code?: string; message?: string };
  const code = err?.decline_code || err?.code || "";
  const map: Record<string, string> = {
    insufficient_funds: "Cartão sem limite suficiente. Tente outro cartão ou pague com Pix.",
    card_declined: "O banco recusou o cartão. Tente outro cartão ou pague com Pix.",
    generic_decline: "O banco recusou o cartão. Tente outro cartão ou pague com Pix.",
    do_not_honor: "O banco recusou o cartão. Fale com o seu banco ou use outro cartão.",
    expired_card: "Cartão vencido. Confira a validade ou use outro cartão.",
    incorrect_cvc: "Código de segurança (CVV) incorreto.",
    invalid_cvc: "Código de segurança (CVV) inválido.",
    incorrect_number: "Número do cartão incorreto.",
    invalid_number: "Número do cartão inválido.",
    invalid_expiry_month: "Mês de validade inválido.",
    invalid_expiry_year: "Ano de validade inválido.",
    processing_error: "Erro ao processar o cartão. Tente de novo em instantes.",
    lost_card: "O banco recusou o cartão. Use outro cartão.",
    stolen_card: "O banco recusou o cartão. Use outro cartão.",
    fraudulent: "O pagamento foi recusado por segurança. Use outro cartão ou pague com Pix.",
    authentication_required: "O banco pediu uma confirmação extra. Tente de novo e confirme no app do banco.",
    payment_intent_authentication_failure: "Não foi possível confirmar o pagamento com o seu banco. Tente de novo.",
    card_not_supported: "Este cartão não aceita este tipo de compra. Use outro cartão.",
    currency_not_supported: "Este cartão não aceita pagamentos em reais. Use outro cartão.",
    installments_not_supported: "Este cartão não aceita parcelamento. Escolha 1x ou use outro cartão.",
    rate_limit: "Muitas tentativas seguidas. Aguarde alguns segundos e tente de novo.",
  };
  if (map[code]) return map[code];
  if (err?.type === "StripeCardError") return "O banco recusou o cartão. Tente outro cartão ou pague com Pix.";
  if (err?.type === "StripeConnectionError" || err?.type === "StripeAPIError") return "Não conseguimos falar com o processador de pagamentos. Tente de novo em instantes.";
  return "Não foi possível processar o pagamento. Nada foi cobrado. Tente de novo.";
}
