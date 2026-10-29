"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Appearance, Stripe, StripeElements } from "@stripe/stripe-js";

/*
 * Cartão pela Stripe (Payment Element só com cartão) dentro do nosso checkout. Os dados do cartão ficam
 * no iframe da Stripe: daqui sai só o id do PaymentMethod, que o servidor usa para cobrar (com parcelas).
 * O visual segue o checkout: Inter, texto #111, campos #F4F4F1 com cantos de 14px e foco preto.
 */

export type StripeCardApi = {
  /** valida e cria o PaymentMethod; `error` já vem em português */
  createPaymentMethod: (billing: { name: string; email: string; phone: string }) => Promise<{ id: string } | { error: string }>;
  /** 3D Secure / autenticação do banco, num modal da Stripe sobre o checkout */
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
    ".Tab--selected:focus": { boxShadow: "inset 0 0 0 2px #111111, 0 0 0 3px #D3F55B" },
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

type Props = {
  publishableKey: string;
  /** valor atual (centavos): a Stripe usa para validar e mostrar o total em autenticações */
  amountCents: number;
  ref?: Ref<StripeCardApi>;
};

export function StripeCard({ publishableKey, amountCents, ref }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const failed = useRef(false);
  const fail = () => { failed.current = true; setState("error"); };
  const firstAmount = useRef(amountCents);

  useEffect(() => {
    let alive = true;
    let destroy: (() => void) | null = null;
    void (async () => {
      try {
        const { loadStripe } = await import("@stripe/stripe-js");
        const stripe = await loadStripe(publishableKey, { locale: "pt-BR" });
        if (!alive || !stripe || !box.current) { if (alive && !stripe) fail(); return; }
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
          fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "if_required" } },
          terms: { card: "never" },
        });
        el.on("ready", () => { if (alive) setState("ready"); });
        el.on("loaderror", () => { if (alive) fail(); });
        el.mount(box.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        destroy = () => el.destroy();
      } catch {
        if (alive) fail();
      }
    })();
    return () => { alive = false; destroy?.(); stripeRef.current = null; elementsRef.current = null; };
  }, [publishableKey]);

  // total muda (parcelas, meia, cupom): mantém o Elements em dia
  useEffect(() => {
    elementsRef.current?.update({ amount: Math.max(50, amountCents) });
  }, [amountCents]);

  useImperativeHandle(ref, () => ({
    async createPaymentMethod(billing) {
      const stripe = stripeRef.current, elements = elementsRef.current;
      if (failed.current) return { error: "Não conseguimos carregar o formulário do cartão. Recarregue a página ou pague com Pix." };
      if (!stripe || !elements) return { error: "O formulário do cartão ainda está carregando. Aguarde um instante." };
      const sub = await elements.submit();
      if (sub.error) return { error: msg(sub.error, "Confira os dados do cartão.") };
      const r = await stripe.createPaymentMethod({
        elements,
        params: { billing_details: { name: billing.name.trim(), email: billing.email.trim(), phone: billing.phone || undefined } },
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
    <div className={state === "loading" ? "spe ld" : "spe"}>
      {state === "loading" && (
        <div className="spe-ld" aria-live="polite">
          <span className="spe-sk" /><span className="spe-sk half" /><span className="spe-sk half" />
          <span className="spe-l">Carregando pagamento seguro…</span>
        </div>
      )}
      {state === "error" && <p className="err">Não conseguimos carregar o formulário do cartão. Confira sua conexão e recarregue a página, ou pague com Pix.</p>}
      <div ref={box} className={state === "ready" ? "spe-el on" : "spe-el"} />
    </div>
  );
}
