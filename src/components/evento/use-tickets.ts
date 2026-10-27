"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { validateCoupon } from "@/lib/actions/checkout";
import type { EventoData } from "./types";

export type Coupon = { code: string; percentOff: number; amountOffCents: number };

export function useTickets(e: EventoData) {
  const router = useRouter();
  const { flash } = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [pending, startCheckout] = useTransition();

  const nq = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);
  const subtotal = useMemo(() => e.tiers.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0), [e.tiers, qty]);
  const discount = coupon ? Math.min(subtotal, Math.round((subtotal * coupon.percentOff) / 100) + coupon.amountOffCents) : 0;
  const total = subtotal - discount;

  const inc = useCallback((id: string) => {
    const tier = e.tiers.find((t) => t.id === id);
    if (!tier || tier.status !== "open") return;
    const sum = Object.values(qty).reduce((s, n) => s + n, 0);
    if (sum >= e.maxPerOrder) { flash(`Máximo de ${e.maxPerOrder} ingressos por pessoa.`); return; }
    const cur = qty[id] ?? 0;
    if (cur >= tier.available) { flash(`Restam só ${tier.available} ingressos em ${tier.name}.`); return; }
    setQty({ ...qty, [id]: cur + 1 });
  }, [e.tiers, e.maxPerOrder, qty, flash]);

  const dec = useCallback((id: string) => {
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) }));
  }, []);

  const applyCoupon = useCallback(() => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    startCheck(async () => {
      const r = await validateCoupon(code, e.id);
      if (r.ok) { setCoupon({ code: r.code, percentOff: r.percentOff, amountOffCents: r.amountOffCents }); setCouponError(null); }
      else { setCoupon(null); setCouponError(r.error); }
    });
  }, [couponInput, e.id]);

  /** Vai para o checkout sem pedir login; a conta só é pedida lá, na etapa Dados. */
  const checkout = useCallback(() => {
    if (!nq || pending) return;
    const itens = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => `${t.id}:${qty[t.id]}`).join(",");
    const p = new URLSearchParams({ evento: e.slug, itens });
    if (coupon) p.set("cupom", coupon.code);
    startCheckout(() => router.push(`/checkout?${p.toString()}`));
  }, [nq, pending, e.tiers, e.slug, qty, coupon, router]);

  const couponMessage = couponError
    ? { cls: "cupmsg err", text: couponError }
    : coupon
      ? { cls: "cupmsg ok", text: `Cupom ${coupon.code} aplicado: ${coupon.percentOff ? `${coupon.percentOff}% de desconto.` : "desconto aplicado."}` }
      : null;

  const qtyLabel = nq ? `${nq} ${nq === 1 ? "ingresso selecionado" : "ingressos selecionados"}` : "Nenhum ingresso selecionado";

  return {
    qty, inc, dec, nq, subtotal, discount, total, qtyLabel,
    couponInput, setCouponInput: (v: string) => { setCouponInput(v.toUpperCase()); setCouponError(null); },
    coupon, couponMessage, applyCoupon, checking,
    checkout, pending,
  };
}

export type Tickets = ReturnType<typeof useTickets>;
