"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { checkCoupon } from "@/lib/actions/compra";
import { createGroup } from "@/lib/actions/grupo";
import { priceOrder } from "@/lib/pricing";
import { roomFor } from "@/lib/tickets/limits";
import type { EventoData } from "./types";

export type Coupon = { code: string; percentOff: number; amountOffCents: number; amountPerTicket: boolean; sector: string | null };

/** Escolha vinda da URL (`itens=<id>:<qtd>,...`, ao voltar do checkout): só tipos à venda, dentro dos limites. */
function parseItens(e: EventoData, raw: string) {
  const q: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [id, n] = part.split(":");
    const k = Math.min(Number.parseInt(n ?? "", 10), roomFor(e.tiers, e.maxPerOrder, q, id ?? "").left);
    if (id && k > 0) q[id] = k;
  }
  return q;
}

export function useTickets(e: EventoData, initialItens = "") {
  const router = useRouter();
  const { flash } = useToast();
  const [qty, setQty] = useState<Record<string, number>>(() => parseItens(e, initialItens));
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [pending, startCheckout] = useTransition();
  /** data escolhida (eventos com várias datas) */
  const [session, setSession] = useState<string | null>(() => {
    const picked = e.tiers.find((t) => (qty[t.id] ?? 0) > 0)?.sessionId;
    return (picked && e.sessions.some((s) => s.id === picked) ? picked : e.sessions[0]?.id) ?? null;
  });
  /** setor escolhido no mapa do local (null = todos) */
  const [sector, setSector] = useState<string | null>(null);
  const visibleTiers = useMemo(
    () => e.tiers.filter((t) => (e.sessions.length <= 1 || t.sessionId === session) && (!sector || t.sector === sector)),
    [e.sessions.length, e.tiers, session, sector],
  );

  // voltou do checkout pelo "voltar" do navegador (a página pode vir da memória, sem os itens da URL)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("itens");
    if (!raw) return;
    const id = requestAnimationFrame(() => setQty((q) => (Object.values(q).some(Boolean) ? q : parseItens(e, raw))));
    return () => cancelAnimationFrame(id);
  }, [e]);

  const nq = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);
  const subtotal = useMemo(() => e.tiers.reduce((s, t) => s + (qty[t.id] ?? 0) * t.priceCents, 0), [e.tiers, qty]);
  const discount = useMemo(() => {
    if (!coupon) return 0;
    const lines = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, priceCents: t.priceCents, quantity: qty[t.id], sector: t.sector }));
    return priceOrder({ lines, holders: [], coupon, method: "pix", installments: 1 }).discount;
  }, [coupon, e.tiers, qty]);
  const total = subtotal - discount;
  /** total com a taxa de serviço (o que a pessoa vai pagar no Pix) */
  const totalWithFee = useMemo(() => {
    const lines = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ ticketTypeId: t.id, priceCents: t.priceCents, quantity: qty[t.id], sector: t.sector }));
    return priceOrder({ lines, holders: [], coupon, method: "pix", installments: 1, feeRate: e.feeRate }).total;
  }, [coupon, e.tiers, e.feeRate, qty]);

  /** Por que não dá para somar mais um deste tipo (limite por compra, por pessoa ou estoque); null se dá. */
  const incBlock = useCallback((id: string) => roomFor(e.tiers, e.maxPerOrder, qty, id).reason, [e.tiers, e.maxPerOrder, qty]);
  const canInc = useCallback((id: string) => incBlock(id) === null, [incBlock]);

  const inc = useCallback((id: string) => {
    const tier = e.tiers.find((t) => t.id === id);
    if (!tier || tier.status !== "open") return;
    const why = incBlock(id);
    if (why) { flash(why); return; }
    setQty({ ...qty, [id]: (qty[id] ?? 0) + 1 });
  }, [e.tiers, qty, flash, incBlock]);

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

  // link de e-mail com ?cupom=CODIGO: o cupom já entra aplicado
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("cupom")?.trim().toUpperCase();
    if (!code) return;
    let alive = true;
    void checkCoupon(code, e.slug).then((r) => {
      if (!alive) return;
      setCouponInput(code);
      if (r.ok) setCoupon({ code: r.code, percentOff: r.percentOff, amountOffCents: r.amountOffCents, amountPerTicket: r.amountPerTicket, sector: r.sector });
      else setCouponError(r.error);
    });
    return () => { alive = false; };
  }, [e.slug]);

  /** Vai para o checkout sem pedir login; a conta só é pedida lá, na etapa Dados. */
  const checkout = useCallback(() => {
    if (!nq || pending) return;
    const itens = e.tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => `${t.id}:${qty[t.id]}`).join(",");
    const p = new URLSearchParams({ evento: e.slug, itens });
    if (coupon) p.set("cupom", coupon.code);
    // a escolha fica na URL do evento: o "voltar" do navegador reabre com os mesmos ingressos
    const here = new URL(window.location.href);
    here.searchParams.set("itens", itens);
    if (coupon) here.searchParams.set("cupom", coupon.code); else here.searchParams.delete("cupom");
    here.searchParams.delete("comprar");
    window.history.replaceState(window.history.state, "", `${here.pathname}${here.search}${here.hash}`);
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
    qty, inc, dec, canInc, incBlock, nq, subtotal, discount, total, totalWithFee, qtyLabel, session, setSession, sector, setSector, visibleTiers,
    couponInput, setCouponInput: (v: string) => { setCouponInput(v.toUpperCase()); setCouponError(null); },
    coupon, couponMessage, applyCoupon, checking,
    checkout, pending, group, grouping,
  };
}

export type Tickets = ReturnType<typeof useTickets>;
