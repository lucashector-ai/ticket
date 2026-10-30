"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Appearance, Stripe, StripeElements } from "@stripe/stripe-js";

/*
 * Cartão pela Stripe (Payment Element só com cartão) dentro do nosso checkout. Os dados do cartão ficam
 * no iframe da Stripe: daqui sai só o id do PaymentMethod, que o servidor usa para cobrar (com parcelas).
 * O visual segue o checkout: Inter, texto #111, campos #F4F4F1 com cantos de 14px e foco preto.
 * Fica montado mesmo quando a pessoa escolhe um cartão salvo (escondido): o 3D Secure usa o mesmo Stripe.js.
 */

/** Endereço de cobrança (país sempre BR). */
export type BillingAddress = { line1: string; line2?: string; city: string; state: string; postal_code: string };
export type CardBilling = { name: string; email: string; phone: string; address?: BillingAddress | null };

export type StripeCardApi = {
  /**
   * Valida e cria o PaymentMethod; `error` já vem em português. `save`: a pessoa pediu para salvar o cartão
   * (pode aparecer de novo nas próximas compras); `metadata`: quem é o titular, guardado com o cartão.
   */
  createPaymentMethod: (billing: CardBilling, opts?: { save?: boolean; metadata?: Record<string, string> }) => Promise<{ id: string } | { error: string }>;
  /** 3D Secure / autenticação do banco, num modal sobre o checkout */
  handleNextAction: (clientSecret: string) => Promise<{ ok: true } | { error: string }>;
};

const APPEARANCE: Appearance = {
  theme: "stripe",
  labels: "above",
  variables: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSizeBase: "15px",
    colorText: "#111111",
    colorTextSecondary: "#6E6E73",
    colorTextPlaceholder: "#6E6E73",
    colorPrimary: "#111111",
    colorBackground: "#FFFFFF",
    colorDanger: "#D93036",
    borderRadius: "14px",
    spacingUnit: "4px",
    gridRowSpacing: "16px",
    gridColumnSpacing: "14px",
    iconColor: "#111111",
  },
  rules: {
    ".Label": { fontSize: "13.5px", fontWeight: "600", color: "#111111", marginBottom: "8px" },
    ".Input": { backgroundColor: "#F4F4F1", border: "0", boxShadow: "none", padding: "15px 16px", lineHeight: "22px" },
    ".Input:focus": { boxShadow: "inset 0 0 0 2px #111111", outline: "none" },
    ".Input--invalid": { backgroundColor: "#FFF5F5", boxShadow: "inset 0 0 0 2px #E5484D", color: "#111111" },
    ".Error": { fontSize: "13px", color: "#D93036", marginTop: "6px" },
    ".Tab": { backgroundColor: "#F7F7F2", border: "0", boxShadow: "none" },
    ".Tab--selected": { backgroundColor: "#FFFFFF", boxShadow: "inset 0 0 0 2px #111111", color: "#111111" },
    ".Tab--selected:focus": { boxShadow: "inset 0 0 0 2px #111111, 0 0 0 3px #EDFF3C" },
  },
};

const PT: Record<string, string> = {
  incomplete_number: "Número do cartão incompleto.",
  invalid_number: "Número do cartão inválido.",
  incomplete_expiry: "Validade incompleta.",
  invalid_expiry_year_past: "Cartão vencido.",
  invalid_expiry_month_past: "Cartão vencido.",
  incomplete_cvc: "Código de segurança incompleto.",
  incomplete_zip: "CEP incompleto.",
};
const msg = (e: { code?: string; message?: string } | undefined, fallback: string) => (e?.code && PT[e.code]) || e?.message || fallback;
const LOAD_FAIL = "Não conseguimos carregar o formulário do cartão. Confira sua conexão e tente de novo, ou pague com Pix.";

type Props = {
  publishableKey: string;
  /** valor atual (centavos): usado para validar e mostrar o total em autenticações */
  amountCents: number;
  /** cartão salvo escolhido: o formulário fica montado, mas escondido */
  hidden?: boolean;
  ref?: Ref<StripeCardApi>;
};

export function StripeCard({ publishableKey, amountCents, hidden, ref }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  /** muda para montar o formulário de novo ("Tentar de novo") */
  const [attempt, setAttempt] = useState(0);
  const failed = useRef(false);
  const firstAmount = useRef(amountCents);

  useEffect(() => {
    let alive = true;
    let destroy: (() => void) | null = null;
    const fail = () => { failed.current = true; if (alive) setState("error"); };
    failed.current = false;
    void (async () => {
      try {
        const { loadStripe } = await import("@stripe/stripe-js");
        // sem o assistente de testes da Stripe (botão flutuante no canto, por cima da barra de pagar no celular)
        const stripe = await loadStripe(publishableKey, { locale: "pt-BR", developerTools: { assistant: { enabled: false } } });
        if (!alive || !box.current) return;
        if (!stripe) { fail(); return; }
        const elements = stripe.elements({
          mode: "payment",
          amount: Math.max(50, firstAmount.current),
          currency: "brl",
          allowedPaymentMethodTypes: ["card"],
          paymentMethodCreation: "manual",
          locale: "pt-BR",
          appearance: APPEARANCE,
          fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" }],
        });
        const el = elements.create("payment", {
          layout: "tabs",
          wallets: { applePay: "never", googlePay: "never", link: "never" },
          // nome, e-mail e celular vêm do nosso formulário (nome impresso, titular): o Element não pergunta
          fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "if_required" } },
          terms: { card: "never" },
        });
        el.on("ready", () => { if (alive) setState("ready"); });
        el.on("loaderror", fail);
        el.mount(box.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        destroy = () => el.destroy();
      } catch {
        fail();
      }
    })();
    return () => { alive = false; destroy?.(); stripeRef.current = null; elementsRef.current = null; };
  }, [publishableKey, attempt]);

  // total muda (parcelas, meia, cupom): mantém o Elements em dia
  useEffect(() => {
    elementsRef.current?.update({ amount: Math.max(50, amountCents) });
  }, [amountCents]);

  useImperativeHandle(ref, () => ({
    async createPaymentMethod(billing, opts) {
      const stripe = stripeRef.current, elements = elementsRef.current;
      if (failed.current) return { error: LOAD_FAIL };
      if (!stripe || !elements) return { error: "O formulário do cartão ainda está carregando. Aguarde um instante." };
      const sub = await elements.submit();
      if (sub.error) return { error: msg(sub.error, "Confira os dados do cartão.") };
      const a = billing.address;
      const r = await stripe.createPaymentMethod({
        elements,
        params: {
          billing_details: {
            name: billing.name.trim(),
            email: billing.email.trim(),
            phone: billing.phone || undefined,
            ...(a ? { address: { line1: a.line1, line2: a.line2 || undefined, city: a.city, state: a.state, postal_code: a.postal_code, country: "BR" } } : {}),
          },
          ...(opts?.save ? { allow_redisplay: "always" as const } : {}),
        },
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
      });
      if (r.error || !r.paymentMethod) return { error: msg(r.error, "Não foi possível validar o cartão. Confira os dados.") };
      return { id: r.paymentMethod.id };
    },
    async handleNextAction(clientSecret) {
      const stripe = stripeRef.current;
      if (!stripe) return { error: "Recarregue a página e tente de novo." };
      const r = await stripe.handleNextAction({ clientSecret });
      if (r.error) return { error: msg(r.error, "O banco não confirmou o pagamento. Tente de novo.") };
      return { ok: true };
    },
  }), []);

  return (
    <div className={`spe${state === "loading" ? " ld" : ""}`} hidden={hidden}>
      {state === "loading" && (
        <div className="spe-ld" role="status" aria-live="polite">
          {/* mesmo desenho do formulário (rótulo em cima, campo de 52px): nada pula quando ele aparece */}
          <span className="spe-f full"><i className="spe-lb" /><i className="spe-sk" /></span>
          <span className="spe-f"><i className="spe-lb" /><i className="spe-sk" /></span>
          <span className="spe-f"><i className="spe-lb" /><i className="spe-sk" /></span>
          <span className="sr">Carregando o formulário seguro do cartão…</span>
        </div>
      )}
      {state === "error" && (
        <div className="spe-err" role="alert">
          <p>{LOAD_FAIL}</p>
          <button className="spe-retry" type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>Tentar de novo</button>
        </div>
      )}
      <div ref={box} className={state === "ready" ? "spe-el on" : "spe-el"} />
    </div>
  );
}
