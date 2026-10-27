"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { checkCoupon } from "@/lib/actions/compra";
import { createGroup } from "@/lib/actions/grupo";
import { priceOrder } from "@/lib/pricing";
import type { EventoData } from "./types";

export type Coupon = { code: string; percentOff: number; amountOffCents: number; amountPerTicket: boolean; sector: string | null };

export function useTickets(e: EventoData) {
  const router = useRouter();
  const { flash } = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [pending, startCheckout] = useTransition();
  /** data escolhida (eventos com várias datas) */
  const [session, setSession] = useState<string | null>(e.sessions[0]?.id ?? null);
  /** setor escolhido no mapa do local (null = todos) */
  const [sector, setSector] = useState<string | null>(null);
  const visibleTiers = useMemo(
    () => e.tiers.filter((t) => (e.sessions.length <= 1 || t.sessionId === session) && (!sector || t.sector === sector)),
    [e.sessions.length, e.tiers, session, sector],
  );

  const nq = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);
  const subtotal = useMemo(() => e.tiers.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0), [e.tiers, qty]);
  const discount = useMemo(() => {
    if (!coupon) return 0;
    const lines = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, priceCents: t.priceCents, quantity: qty[t.id], sector: t.sector }));
    return priceOrder({ lines, holders: [], coupon, method: "pix", installments: 1 }).discount;
  }, [coupon, e.tiers, qty]);
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
      const r = await checkCoupon(code, e.slug);
      if (r.ok) { setCoupon({ code: r.code, percentOff: r.percentOff, amountOffCents: r.amountOffCents, amountPerTicket: r.amountPerTicket, sector: r.sector }); setCouponError(null); }
      else { setCoupon(null); setCouponError(r.error); }
    });
  }, [couponInput, e.slug]);

  /** Vai para o checkout sem pedir login; a conta só é pedida lá, na etapa Dados. */
  const checkout = useCallback(() => {
    if (!nq || pending) return;
    const itens = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => `${t.id}:${qty[t.id]}`).join(",");
    const p = new URLSearchParams({ evento: e.slug, itens });
    if (coupon) p.set("cupom", coupon.code);
    startCheckout(() => router.push(`/checkout?${p.toString()}`));
  }, [nq, pending, e.tiers, e.slug, qty, coupon, router]);

  /** Compra em grupo: reserva os ingressos escolhidos e leva à página do grupo para chamar os amigos. */
  const [grouping, startGroup] = useTransition();
  const group = useCallback(() => {
    if (nq < 2 || grouping) return;
    const items = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] }));
    startGroup(async () => {
      const r = await createGroup({ eventSlug: e.slug, items });
      if (r.ok) router.push(`/grupo/${r.code}`);
      else if (r.needsLogin) router.push(`/entrar?next=${encodeURIComponent(`/eventos/${e.slug}`)}`);
      else flash(r.error);
    });
  }, [nq, grouping, e.tiers, e.slug, qty, router, flash]);

  const couponMessage = couponError
    ? { cls: "cupmsg err", text: couponError }
    : coupon
      ? { cls: "cupmsg ok", text: `Cupom ${coupon.code} aplicado: ${coupon.percentOff ? `${coupon.percentOff}% de desconto` : "desconto aplicado"}${coupon.sector ? ` em ${coupon.sector}` : ""}.` }
      : null;

  const qtyLabel = nq ? `${nq} ${nq === 1 ? "ingresso selecionado" : "ingressos selecionados"}` : "Nenhum ingresso selecionado";

  return {
    qty, inc, dec, nq, subtotal, discount, total, qtyLabel, session, setSession, sector, setSector, visibleTiers,
    couponInput, setCouponInput: (v: string) => { setCouponInput(v.toUpperCase()); setCouponError(null); },
    coupon, couponMessage, applyCoupon, checking,
    checkout, pending, group, grouping,
  };
}

export type Tickets = ReturnType<typeof useTickets>;
