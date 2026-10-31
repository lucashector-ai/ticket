import { afterEach, describe, expect, it, vi } from "vitest";
import { isProductionSite, paymentsAvailable, testPaymentsAllowed } from "@/lib/payments/stripe";

/*
 * SEC-100: o modo de teste de pagamento (confirmar pedido com valor sem cobrança) não liga sozinho no site de
 * produção quando falta a chave da Stripe. Só com ALLOW_TEST_PAYMENTS=1 (decisão do dono) ou fora da produção.
 */
const prod = () => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ticketswin.com.br"); };

describe("SEC-100: testPaymentsAllowed", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("produção sem chave e sem ALLOW_TEST_PAYMENTS: recusa (nada de ingresso pago de graça)", () => {
    prod();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "");
    expect(isProductionSite()).toBe(true);
    expect(testPaymentsAllowed()).toBe(false);
    expect(paymentsAvailable()).toBe(false);
  });

  it("produção com www e sem NEXT_PUBLIC_SITE_URL (cai no endereço da produção): também recusa", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.ticketswin.com.br/");
    expect(testPaymentsAllowed()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(testPaymentsAllowed()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "não é url");
    expect(testPaymentsAllowed()).toBe(false);
  });

  it("produção com ALLOW_TEST_PAYMENTS=1: liberado (decisão explícita); outro valor não libera", () => {
    prod();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "1");
    expect(testPaymentsAllowed()).toBe(true);
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "true");
    expect(testPaymentsAllowed()).toBe(false);
  });

  it("fora da produção (next dev, testes ou outro endereço): liberado como antes", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ticketswin.com.br");
    expect(testPaymentsAllowed()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3042");
    expect(testPaymentsAllowed()).toBe(true);
    // domínio parecido não engana a conferência (é outro site)
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ticketswin.com.br.example.com");
    expect(testPaymentsAllowed()).toBe(true);
  });

  it("com a chave da Stripe: nunca é modo de teste, nem com ALLOW_TEST_PAYMENTS=1", () => {
    prod();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_falsa");
    vi.stubEnv("ALLOW_TEST_PAYMENTS", "1");
    expect(testPaymentsAllowed()).toBe(false);
    expect(paymentsAvailable()).toBe(true);
  });
});
