import "server-only";
import Stripe from "stripe";

/*
 * Stripe (pagamentos de verdade: cartão com parcelamento e Pix), tudo dentro do nosso checkout.
 *
 *   STRIPE_SECRET_KEY       sk_live_... / sk_test_...  (servidor)
 *   STRIPE_PUBLISHABLE_KEY  pk_live_... / pk_test_...  (vai para o navegador como prop, sem NEXT_PUBLIC_)
 *   STRIPE_WEBHOOK_SECRET   whsec_...                  (assinatura do POST /api/webhooks/stripe)
 *
 * Sem STRIPE_SECRET_KEY o checkout segue no modo de teste (paymentRef TEST-…, nada é cobrado e a venda
 * não entra no saldo sacável). Com ela, pedido com valor só vira pago depois que a Stripe confirma.
 * As variáveis são lidas a cada chamada (Workers: os segredos chegam em runtime, não no build).
 */

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

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
