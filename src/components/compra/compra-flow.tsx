"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MINI_CHECK, PAY_APPROVED_MS, PAY_MIN_MS, playPaymentFlood } from "@/lib/pay-anim";
import { CitySelect, UfSelect } from "@/components/city-select";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { checkCoupon, confirmPayment, placeOrder, type ConfirmResult } from "@/lib/actions/compra";
import { abandonPayment, checkPayment, payCard, type PayCardInput } from "@/lib/actions/pagamento";
import { myCards } from "@/lib/actions/cartoes";
import type { SavedCard } from "@/lib/payments/cards";
import { StripeCard, type BillingAddress, type StripeCardApi } from "./stripe-card";
import { CardBrand, expLabel } from "./card-brand";
import { QueueGate } from "@/components/queue-gate";
import { installmentOptions, money, priceOrder } from "@/lib/pricing";
import { InlineAuth } from "./inline-auth";
import { cardBrand, expOk, fmtCard, fmtCep, fmtCpf, fmtExp, isEmail, isFullName, mmss, onlyDigits, printedNameOk } from "./format";
import { cpfValid } from "@/lib/cpf";
import { PhoneField } from "@/components/phone-field";
import { phoneValid } from "@/lib/phone";
import type { ResumeData } from "@/lib/payments/pending";

export type CompraStep = "resumo" | "dados" | "pagamento" | "pix" | "proc" | "done";
/**
 * `name`: rótulo completo ("Pista · Inteira"), usado no resumo e nos titulares; `type`: só o tipo ("Inteira").
 * `meiaOk`: o titular pode marcar meia-entrada (tipos de inteira); meia e social já vêm com preço próprio.
 */
export type CompraTier = {
  id: string; name: string; type: string; note: string; desc: string | null; priceCents: number; open: boolean; sold: boolean;
  sector: string | null; sectorColor: string | null; sessionId: string | null; meiaOk: boolean;
  /** máximo por pessoa deste tipo */
  limit: number;
};
/** "Grátis" no lugar de R$ 0,00 */
const priceOf = (cents: number) => (cents ? money(cents) : "Grátis");
/** Uma data de evento com várias datas: pílula (`wd`, `day`, `sub`) e rótulo do resumo ("Sex, 30 Out · 21h"). */
export type CompraSession = { id: string; wd: string; day: string; sub: string; label: string };
export type CompraEvent = {
  slug: string; title: string; flyerId: string; dateNice: string; venue: string; city: string; maxPerOrder: number; tiers: CompraTier[];
  /** vazio quando o evento tem uma data só */
  sessions: CompraSession[];
  /** 0 quando o produtor absorve a taxa de serviço */
  feeRate: number;
};
type Coupon = { code: string; percentOff: number; amountOffCents: number; amountPerTicket: boolean; sector: string | null };
const couponOf = (r: Coupon) => ({ code: r.code, percentOff: r.percentOff, amountOffCents: r.amountOffCents, amountPerTicket: r.amountPerTicket, sector: r.sector });
/** `me`: o ingresso é do comprador (fica na conta dele); senão vai por e-mail para `email` depois do pagamento. */
type Hold = { name: string; me: boolean; meia: boolean; email: string };
/** `live`: Pix de verdade (Stripe), confirmado sozinho; senão, o Pix de teste. */
type PixOrder = { orderId: string; number: number; totalCents: number; pixCode: string; pixQrSvg: string; expiresAt: string | null; live: boolean; testUrl: string | null };
type Done = Extract<ConfirmResult, { ok: true }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** hora atual (só nos handlers de pagamento, para a animação durar o mínimo) */
const nowMs = () => Date.now();
/** segundos até um horário ISO (prazo do Pix gerado pela Stripe) */
const secondsUntil = (iso: string) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000));
const low = (v: string) => v.trim().toLowerCase();

/**
 * "Impressão digital" do pedido: se nada mudou desde que o pedido pendente foi criado (itens, titulares, comprador,
 * cupom, forma de pagamento, parcelas e total), ele é reaproveitado; senão o servidor cria outro e libera o antigo.
 */
type Fp = { method: string; inst: number; total: number; items: string[]; holders: string[]; buyer: string; coupon: string };
const fpKey = (f: Fp) => JSON.stringify({ ...f, inst: f.method === "card" ? f.inst : 1, items: [...f.items].sort(), holders: [...f.holders].sort() });
const holderFp = (h: { ticketTypeId: string; name: string; meia: boolean; me: boolean; email: string }) => `${h.ticketTypeId}|${h.name.trim()}|${h.meia}|${h.me}|${h.me ? "" : low(h.email)}`;
const buyerFp = (b: { name: string; email: string; cpf: string }) => `${b.name.trim()}|${low(b.email)}|${onlyDigits(b.cpf)}`;
const resumeKey = (r: ResumeData) => fpKey({
  method: r.method, inst: r.installments, total: r.totalCents,
  items: r.items.map((i) => `${i.ticketTypeId}:${i.quantity}`), holders: r.holders.map(holderFp), buyer: buyerFp(r.buyer), coupon: r.coupon?.code ?? "",
});
type Pending = { orderId: string; key: string };

/** chave da data do ingresso no resumo ("" quando o evento tem uma data só) */
const dayOf = (e: CompraEvent, t: CompraTier) => (e.sessions.length ? t.sessionId ?? "" : "");
type TierGroup = { name: string | null; color: string | null; tiers: CompraTier[] };

const RESERVA_SEG = 900; // igual ao prazo do pedido no servidor (15 min)
const PIX_SEG = 900;
const STEP_INDEX: Record<CompraStep, number> = { resumo: 0, dados: 1, pagamento: 2, pix: 2, proc: 2, done: 3 };

/** Compra com 1 ingresso travado: parte de um grupo ou anúncio da revenda. */
export type CompraLock = {
  kind: "grupo" | "revenda";
  ref: { groupShareId?: string; resaleListingId?: string };
  /** parâmetros que identificam a compra na URL do checkout */
  query: string;
  title: string;
  note: string;
  back: string;
};

type Props = {
  event: CompraEvent;
  user: { id: string; name: string; email: string } | null;
  profile: { name: string; phone: string; cpf: string } | null;
  initialQty: Record<string, number>;
  initialCoupon: string | null;
  initialStep: CompraStep;
  /** id do evento quando a fila virtual está ligada */
  queueEventId?: string | null;
  lock?: CompraLock | null;
  /** chave do verificador de humanos (Turnstile), quando ligado */
  human?: string | null;
  /** mostra "Continuar com a Apple" no login do checkout */
  apple?: boolean;
  /** chave publicável da Stripe: com ela o pagamento é de verdade; sem ela, modo de teste */
  stripeKey?: string | null;
  /** pedido criado e ainda não pago (recarregou a página, voltou de Meus ingressos): continua nele */
  resume?: ResumeData | null;
  /** aviso no topo (ex.: a reserva do pedido anterior acabou) */
  notice?: string | null;
  /** a conta já salvou cartão alguma vez: a etapa do cartão busca os cartões salvos */
  hasSavedCards?: boolean;
};

/** Endereço de cobrança do titular (opcional), preenchido pelo CEP. */
type Addr = { cep: string; street: string; number: string; complement: string; district: string; city: string; uf: string };
const NO_ADDR: Addr = { cep: "", street: "", number: "", complement: "", district: "", city: "", uf: "" };
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export function CompraFlow({ event, user, profile, initialQty, initialCoupon, initialStep, queueEventId, lock, human, apple = false, stripeKey, resume, notice, hasSavedCards }: Props) {
  const live = !!stripeKey;
  const router = useRouter();
  const { flash } = useToast();
  /* retomada: Pix já gerado → tela do QR; cartão → etapa de pagamento; grátis → dados (confirma de novo) */
  const [step, setStep] = useState<CompraStep>(() => !resume ? initialStep : resume.method === "free" ? "dados" : resume.method === "pix" && resume.pix ? "pix" : "pagamento");
  const [qty, setQty] = useState<Record<string, number>>(initialQty);
  const [couponInput, setCouponInput] = useState(resume?.coupon?.code ?? initialCoupon ?? "");
  const [coupon, setCoupon] = useState<Coupon | null>(resume?.coupon ?? null);
  const [cupErr, setCupErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [name, setName] = useState(resume?.buyer.name || profile?.name || user?.name || "");
  const [email, setEmail] = useState(resume?.buyer.email || user?.email || "");
  const [phone, setPhone] = useState(resume?.buyer.phone || profile?.phone || "");
  const [cpf, setCpf] = useState(resume?.buyer.cpf ? fmtCpf(resume.buyer.cpf) : profile?.cpf ? fmtCpf(profile.cpf) : "");
  /* titulares do pedido retomado, na mesma ordem em que o checkout monta os ingressos */
  const [hold, setHold] = useState<Record<string, Hold>>(() => {
    const o: Record<string, Hold> = {};
    if (!resume) return o;
    const queue = [...resume.holders];
    for (const t of event.tiers) {
      if (!t.open) continue;
      for (let k = 0; k < (initialQty[t.id] ?? 0); k++) {
        const i = queue.findIndex((h) => h.ticketTypeId === t.id);
        if (i < 0) continue;
        const h = queue.splice(i, 1)[0];
        o[`${t.id}-${k}`] = { name: h.me ? "" : h.name, me: h.me, meia: h.meia, email: h.email };
      }
    }
    return o;
  });
  const [pay, setPay] = useState<"pix" | "card">(resume?.method === "card" ? "card" : "pix");
  const [inst, setInst] = useState(resume?.method === "card" ? resume.installments : 1);
  /** modo de teste (sem processador): número, validade e CVV digitados aqui, que não saem do navegador */
  const [cc, setCc] = useState({ num: "", exp: "", cvv: "" });
  /** nome impresso no cartão; null = ainda não mexeu (usa o nome de quem compra) */
  const [cardName, setCardName] = useState<string | null>(null);
  /** o cartão é de outra pessoa: CPF, e-mail e endereço do titular */
  const [other, setOther] = useState(false);
  const [holder, setHolder] = useState({ cpf: "", email: "" });
  const [addrOpen, setAddrOpen] = useState(false);
  const [addr, setAddr] = useState<Addr>(NO_ADDR);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const numRef = useRef<HTMLInputElement>(null);
  /** salvar o cartão novo para as próximas compras (só com o processador ligado) */
  const [saveCard, setSaveCard] = useState(false);
  /** cartões salvos da conta: null enquanto carrega; "new" = usar outro cartão */
  const [saved, setSaved] = useState<SavedCard[] | null>(live && hasSavedCards ? null : []);
  const [cardSel, setCardSel] = useState<string>("new");
  const [left, setLeft] = useState(resume ? resume.secondsLeft : RESERVA_SEG);
  const [pixLeft, setPixLeft] = useState(resume?.pix ? resume.pix.secondsLeft : PIX_SEG);
  const [copied, setCopied] = useState(false);
  const [order, setOrder] = useState<PixOrder | null>(resume?.pix
    ? { orderId: resume.orderId, number: resume.number, totalCents: resume.totalCents, pixCode: resume.pix.pixCode, pixQrSvg: resume.pix.pixQrSvg, expiresAt: resume.pix.expiresAt, live: resume.pix.live, testUrl: resume.pix.testUrl }
    : null);
  const [done, setDone] = useState<Done | null>(null);
  /* Stripe: cartão no Payment Element, erro do pagamento, parcelas aceitas pelo cartão */
  const cardApi = useRef<StripeCardApi>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [cardInst, setCardInst] = useState<number[] | null>(null);
  /** prazo do pedido aberto e do Pix dele (ISO): os cronômetros contam até eles */
  const deadline = useRef<string | null>(resume?.expiresAt ?? null);
  const pixDeadline = useRef<string | null>(resume?.pix?.expiresAt ?? null);
  /** pedido pendente desta compra (criado agora ou retomado): reaproveitado enquanto nada mudar */
  const pendingRef = useRef<Pending | null>(resume ? { orderId: resume.orderId, key: resumeKey(resume) } : null);
  const [pendingId, setPendingId] = useState<string | null>(resume?.orderId ?? null);
  const setPending = useCallback((p: Pending | null) => {
    pendingRef.current = p;
    setPendingId(p?.orderId ?? null);
    // sem pedido aberto, o cronômetro volta a contar sozinho (não vence pelo prazo de um pedido cancelado)
    if (!p) { deadline.current = null; pixDeadline.current = null; }
  }, []);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);
  /** botão de pagar: processando (lima, com a barra) → aprovado (check) → cortina */
  const [payPhase, setPayPhase] = useState<"idle" | "paying" | "approved">("idle");
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [authNudge, setAuthNudge] = useState(false);
  const authRef = useRef<HTMLDivElement>(null);
  /* data escolhida no resumo: a dos ingressos já selecionados, senão a primeira */
  const [session, setSession] = useState<string | null>(() => {
    const picked = new Set(event.tiers.filter((t) => (initialQty[t.id] ?? 0) > 0).map((t) => t.sessionId));
    return (event.sessions.find((s) => picked.has(s.id)) ?? event.sessions[0])?.id ?? null;
  });
  /* setores abertos por data; nas datas com ingressos vindos da página do evento, abrem só os setores escolhidos */
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    const withSel = new Set(event.tiers.filter((t) => t.sector && (initialQty[t.id] ?? 0) > 0).map((t) => dayOf(event, t)));
    for (const t of event.tiers) {
      if (!t.sector || !withSel.has(dayOf(event, t))) continue;
      const k = `${dayOf(event, t)}|${t.sector}`;
      o[k] = o[k] || (initialQty[t.id] ?? 0) > 0;
    }
    return o;
  });

  /* cronômetros da reserva e do Pix: com pedido criado, contam até o prazo dele (pelo relógio do aparelho) */
  useEffect(() => {
    const iv = setInterval(() => {
      setLeft((l) => (deadline.current ? secondsUntil(deadline.current) : l > 0 ? l - 1 : 0));
      setPixLeft((l) => (pixDeadline.current ? secondsUntil(pixDeadline.current) : l > 0 ? l - 1 : 0));
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* depois de entrar na conta, preenche o que estiver vazio */
  const [seenUser, setSeenUser] = useState(user?.id ?? null);
  if (user && user.id !== seenUser) {
    setSeenUser(user.id);
    setName((n) => n || profile?.name || user.name || "");
    setEmail((m) => m || user.email || "");
    setPhone((p) => p || (profile?.phone ?? ""));
    setCpf((c) => c || (profile?.cpf ? fmtCpf(profile.cpf) : ""));
    setAuthNudge(false);
  }

  /* cupom vindo da página do evento */
  useEffect(() => {
    if (!initialCoupon) return;
    void checkCoupon(initialCoupon, event.slug).then((r) => {
      if (r.ok) setCoupon(couponOf(r));
      else setCupErr(r.error);
    });
  }, [initialCoupon, event.slug]);

  /* mantém a seleção na URL (volta do Google, recarregar a página) */
  const urlFor = useCallback((s: CompraStep) => {
    const itens = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => `${id}:${q}`).join(",");
    const p = new URLSearchParams({ evento: event.slug });
    if (lock) {
      if (s === "dados") p.set("etapa", "dados");
      return `/checkout?${p.toString()}&${lock.query}`;
    }
    if (itens) p.set("itens", itens);
    if (coupon) p.set("cupom", coupon.code);
    if (s === "dados") p.set("etapa", "dados");
    return `/checkout?${p.toString()}`;
  }, [qty, coupon, event.slug, lock]);
  useEffect(() => {
    if (step === "done") return;
    // com pedido criado, a URL aponta para ele: recarregar (ou voltar depois) continua no mesmo pagamento
    if (pendingId && step !== "resumo" && step !== "dados") window.history.replaceState(null, "", `/checkout?pedido=${pendingId}`);
    else if (step === "resumo" || step === "dados" || step === "pagamento") window.history.replaceState(null, "", urlFor(step === "pagamento" ? "dados" : step));
  }, [step, urlFor, pendingId]);

  /* ingressos e titulares */
  const holders = useMemo(() => {
    const out: { key: string; n: number; tier: CompraTier }[] = [];
    for (const t of event.tiers) {
      if (!t.open) continue;
      for (let k = 0; k < (qty[t.id] ?? 0); k++) out.push({ key: `${t.id}-${k}`, n: out.length + 1, tier: t });
    }
    return out;
  }, [event.tiers, qty]);
  const nq = holders.length;
  const lines = event.tiers.filter((t) => t.open && (qty[t.id] ?? 0) > 0)
    .map((t) => ({ ticketTypeId: t.id, priceCents: t.priceCents, quantity: qty[t.id] ?? 0, name: t.name, sector: t.sector, meiaOk: t.meiaOk }));
  const isMeia = (h: { key: string; tier: CompraTier }) => h.tier.meiaOk && !!hold[h.key]?.meia;
  const price = priceOrder({
    lines,
    holders: holders.map((h) => ({ ticketTypeId: h.tier.id, meia: isMeia(h) })),
    coupon,
    method: pay,
    installments: inst,
    feeRate: event.feeRate,
  });
  const installments = installmentOptions(price.base);
  /** pedido sem valor (ingressos grátis ou cupom de 100%): pula o pagamento */
  const free = nq > 0 && price.total === 0;

  /* resumo: ingressos da data escolhida agrupados por setor (na ordem em que aparecem); sem setor, lista simples */
  const multiDay = event.sessions.length > 0;
  const dayKey = multiDay ? session ?? "" : "";
  const groups: TierGroup[] = [];
  for (const t of event.tiers) {
    if (multiDay && t.sessionId && t.sessionId !== session) continue;
    const g = groups.find((x) => x.name === t.sector);
    if (g) g.tiers.push(t); else groups.push({ name: t.sector, color: t.sectorColor, tiers: [t] });
  }
  const firstSec = groups.find((g) => g.name);
  const dayLabel = (id: string) => (multiDay ? event.sessions.find((s) => s.id === event.tiers.find((t) => t.id === id)?.sessionId)?.label ?? null : null);

  /* validação */
  const blankHold = (h: { n: number }): Hold => ({ name: "", me: h.n === 1, meia: false, email: "" });
  const hdOf = (h: { key: string; n: number }) => hold[h.key] ?? blankHold(h);
  /** "Sou eu": o nome é o do comprador */
  const holdName = (h: { key: string; n: number }) => (hdOf(h).me ? name : hdOf(h).name).trim();
  const holdEmail = (h: { key: string; n: number }) => (hdOf(h).me ? "" : low(hdOf(h).email));
  const ownEmails = [email, user?.email ?? ""].map(low).filter(Boolean);
  /** problema no e-mail de quem recebe (null = ok) */
  const perEmail = new Map<string, number>();
  const holdEmailErr = new Map<string, string>();
  for (const h of holders) {
    if (hdOf(h).me) continue;
    const em = holdEmail(h);
    if (!isEmail(em)) { holdEmailErr.set(h.key, "Informe o e-mail de quem vai usar este ingresso."); continue; }
    if (ownEmails.includes(em)) { holdEmailErr.set(h.key, "Esse é o seu e-mail. Para o seu ingresso, toque em “Sou eu”."); continue; }
    const k = `${em}|${h.tier.id}`;
    const n = (perEmail.get(k) ?? 0) + 1;
    perEmail.set(k, n);
    if (n > h.tier.limit) holdEmailErr.set(h.key, `Cada pessoa pode receber até ${h.tier.limit} ${h.tier.limit === 1 ? "ingresso" : "ingressos"} de ${h.tier.name}.`);
  }
  const dadosErr: string[] = [];
  if (!isFullName(name)) dadosErr.push("nome e sobrenome");
  if (!isEmail(email)) dadosErr.push("e-mail");
  if (!phoneValid(phone)) dadosErr.push("celular com DDD");
  if (!cpfValid(cpf)) dadosErr.push(onlyDigits(cpf).length === 11 ? "CPF válido (confira os números)" : "CPF (obrigatório)");
  if (!holders.every((h) => isFullName(holdName(h)))) dadosErr.push("nome completo de cada titular");
  if (holdEmailErr.size) dadosErr.push("e-mail de quem vai receber cada ingresso");
  /** impressão digital do que está na tela, para reaproveitar o pedido pendente */
  const fpNow = (method: "pix" | "card" | "free") => fpKey({
    method, inst, total: price.total,
    items: lines.map((l) => `${l.ticketTypeId}:${l.quantity}`),
    holders: holders.map((h) => holderFp({ ticketTypeId: h.tier.id, name: holdName(h), meia: isMeia(h), me: hdOf(h).me, email: holdEmail(h) })),
    buyer: buyerFp({ name, email, cpf }), coupon: lock ? "" : coupon?.code ?? "",
  });
  /* etapa do cartão: cartão salvo escolhido ou cartão novo (com titular, se for de outra pessoa) */
  const usingSaved = live && cardSel !== "new" && !!saved?.some((c) => c.id === cardSel && !c.expired);
  const printed = (cardName ?? (other ? "" : name)).trim();
  const holderCpf = onlyDigits(holder.cpf);
  const sameCpf = holderCpf.length === 11 && holderCpf === onlyDigits(cpf);
  const addrUsed = other && addrOpen && Object.values(addr).some((v) => v.trim());
  const addrOk = {
    cep: onlyDigits(addr.cep).length === 8, street: addr.street.trim().length >= 2, number: addr.number.trim().length >= 1,
    city: addr.city.trim().length >= 2, uf: UFS.includes(addr.uf.trim().toUpperCase()),
  };
  const ccOk = {
    num: live || onlyDigits(cc.num).length >= 15, exp: live || expOk(cc.exp), cvv: live || onlyDigits(cc.cvv).length >= 3,
    name: printedNameOk(printed),
    cpf: !other || (cpfValid(holder.cpf) && !sameCpf),
    email: !other || !holder.email.trim() || isEmail(holder.email),
    addr: !addrUsed || Object.values(addrOk).every(Boolean),
  };
  const cardErr: string[] = [];
  if (!usingSaved) {
    if (!ccOk.num) cardErr.push("número do cartão");
    if (!ccOk.exp) cardErr.push("validade");
    if (!ccOk.cvv) cardErr.push("CVV");
    if (!ccOk.name) cardErr.push(other ? "nome do titular como impresso no cartão" : "nome impresso no cartão");
    if (!ccOk.cpf) cardErr.push(sameCpf ? "CPF do titular (é o seu CPF: se o cartão é seu, desligue “O cartão é de outra pessoa?”)" : "CPF do titular");
    if (!ccOk.email) cardErr.push("e-mail do titular (ou deixe em branco)");
    if (!ccOk.addr) cardErr.push("endereço de cobrança completo (ou feche o endereço)");
  }
  const cardValid = cardErr.length === 0;
  const billingAddress = (): BillingAddress | null => addrUsed ? {
    line1: `${addr.street.trim()}, ${addr.number.trim()}`.slice(0, 200),
    line2: [addr.complement.trim(), addr.district.trim()].filter(Boolean).join(" - ").slice(0, 200) || undefined,
    city: addr.city.trim(), state: addr.uf.trim().toUpperCase(), postal_code: fmtCep(addr.cep),
  } : null;
  const setA = (patch: Partial<Addr>) => setAddr((o) => ({ ...o, ...patch }));
  async function lookupCep(v: string) {
    const d = onlyDigits(v);
    if (d.length !== 8) return;
    setCepBusy(true);
    setCepMsg(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) setCepMsg("CEP não encontrado. Preencha o endereço à mão.");
      else {
        setAddr((o) => ({ ...o, street: j.logradouro || o.street, district: j.bairro || o.district, city: j.localidade || o.city, uf: j.uf || o.uf }));
        numRef.current?.focus();
      }
    } catch { setCepMsg("Não conseguimos buscar o CEP agora. Preencha o endereço à mão."); }
    setCepBusy(false);
  }
  const pickCard = (id: string) => { setCardSel(id); setCardInst(null); setPayErr(null); setTried(false); };
  const bad = (ok: boolean) => (tried && !ok ? "in2 bad" : "in2");
  /* no Pix (que tem o próprio prazo) e durante a confirmação a reserva não corta a tela */
  const expired = left <= 0 && step !== "done" && step !== "pix" && step !== "proc";

  const go = (s: CompraStep) => { setStep(s); setTried(false); setSlow(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  /** Pagamento aprovado: tela de confirmação no lugar. */
  const finishWith = useCallback((r: Done) => {
    setPending(null);
    setDone(r);
    setStep("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
    // o pedido está pago: a URL volta para o evento (um ?pedido= pago levaria para Meus ingressos)
    window.history.replaceState(null, "", urlFor("resumo"));
    // parte de grupo / revenda: recarregar a página levaria de volta ao grupo (a vaga já está paga)
    if (!lock) router.refresh();
  }, [lock, router, setPending, urlFor]);

  /** Pagamento aprovado com animação: botão "aprovado" (cartão/grátis), cortina lima e a confirmação entra por baixo. */
  const celebrate = useCallback(async (r: Done, o: { fromButton: boolean; startedAt?: number }) => {
    if (o.fromButton) {
      const rest = PAY_MIN_MS - (nowMs() - (o.startedAt ?? nowMs()));
      if (rest > 0) await sleep(rest);
      setPayPhase("approved");
      await sleep(PAY_APPROVED_MS);
    }
    const how = r.method === "free" ? "Gratuito" : r.method === "card" ? `Cartão ${r.installments}x` : "Pix";
    await playPaymentFlood({
      origin: o.fromButton ? ctaRef.current?.getBoundingClientRect() : null,
      summary: r.method === "free" ? `${how} · Pedido #${r.number}` : `${priceOf(r.totalCents)} · ${how} · Pedido #${r.number}`,
      onCovered: () => { setPayPhase("idle"); finishWith(r); },
      revealRoot: () => document.querySelector(".ck .done"),
    });
  }, [finishWith]);

  /* Pix de verdade: confere o pagamento a cada 3 s enquanto o QR está na tela */
  const pixOrderId = step === "pix" && order?.live ? order.orderId : null;
  useEffect(() => {
    if (!pixOrderId) return;
    let alive = true;
    const iv = setInterval(async () => {
      const r = await checkPayment(pixOrderId);
      if (!alive) return;
      if (r.status === "paid") { alive = false; clearInterval(iv); void celebrate(r.result, { fromButton: false }); }
      else if (r.status === "closed" || r.status === "failed") { alive = false; clearInterval(iv); flash(r.error); setOrder(null); setPending(null); setStep("pagamento"); }
    }, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [pixOrderId, celebrate, flash, setPending]);

  /* cartões salvos: busca uma vez, quando a pessoa chega no cartão; escolhe o principal (ou o mais recente válido) */
  const wantCards = live && !!hasSavedCards && step === "pagamento" && pay === "card";
  const cardsAsked = useRef(false);
  useEffect(() => {
    if (!wantCards || cardsAsked.current) return;
    cardsAsked.current = true;
    void myCards().catch(() => null).then((r) => {
      const list = r?.ok ? r.cards : [];
      setSaved(list);
      setCardSel(list.find((c) => !c.expired)?.id ?? "new");
    });
  }, [wantCards]);

  const setTierQty = (id: string, delta: number) => {
    if (lock) return;
    const tier = event.tiers.find((t) => t.id === id);
    if (delta > 0 && tier && (qty[id] ?? 0) >= tier.limit) { flash(`Máximo de ${tier.limit} ${tier.limit === 1 ? "ingresso" : "ingressos"} de ${tier.name} por pessoa.`); return; }
    setQty((o) => {
      const total = Object.values(o).reduce((s, v) => s + v, 0);
      if (delta > 0 && total >= event.maxPerOrder) { flash(`Máximo de ${event.maxPerOrder} ingressos por pessoa.`); return o; }
      return { ...o, [id]: Math.max(0, (o[id] ?? 0) + delta) };
    });
    setTried(false);
  };

  async function applyCoupon() {
    const c = couponInput.trim().toUpperCase();
    if (!c) return;
    const r = await checkCoupon(c, event.slug);
    if (r.ok) { setCoupon(couponOf(r)); setCupErr(null); }
    else { setCoupon(null); setCupErr(r.error); }
  }

  function nudgeLogin() {
    setAuthNudge(true);
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    flash("Entre ou crie sua conta para continuar.");
  }

  async function submitOrder(method: "pix" | "card" | "free") {
    setBusy(true);
    const r = await placeOrder({
      eventSlug: event.slug,
      items: lines.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity })),
      coupon: lock ? null : coupon?.code ?? null,
      ...lock?.ref,
      buyer: { name, email, phone, cpf },
      holders: holders.map((h) => ({ ticketTypeId: h.tier.id, name: holdName(h), meia: isMeia(h), me: hdOf(h).me, email: hdOf(h).me ? null : holdEmail(h) })),
      method,
      installments: method === "card" ? inst : 1,
    });
    setBusy(false);
    if (!r.ok) {
      flash(r.error);
      if (r.needsLogin) go("dados");
      return null;
    }
    if (r.expiresAt) { deadline.current = r.expiresAt; setLeft(secondsUntil(r.expiresAt)); }
    return r;
  }

  /** Pedido pendente que vale para o que está na tela (o mesmo de antes, se nada mudou) ou um novo. */
  async function orderFor(method: "card" | "free") {
    const key = fpNow(method);
    const p = pendingRef.current;
    if (p && p.key === key) return p.orderId;
    // o servidor libera o pedido anterior deste evento ao criar o novo
    const r = await submitOrder(method);
    if (!r) return null;
    setPending({ orderId: r.orderId, key });
    return r.orderId;
  }

  /** Pedido grátis ou modo de teste (sem Stripe): confirma sem gateway. */
  async function finish(orderId: string, startedAt = nowMs()) {
    // no Pix de teste ("Já fiz o pagamento") não há botão de pagar: a cortina nasce do centro
    const fromButton = step !== "pix";
    if (fromButton) setPayPhase("paying"); else go("proc");
    const r = await confirmPayment(orderId);
    if (!r.ok) { setPayPhase("idle"); flash(r.error); setPending(null); go(free ? "dados" : "pagamento"); return; }
    await celebrate(r, { fromButton, startedAt });
  }

  /** Cartão pela Stripe: cobra, passa pelo 3D Secure se o banco pedir e espera a confirmação. */
  async function payLive(orderId: string, card: Omit<PayCardInput, "orderId">, startedAt = nowMs()) {
    setPayPhase("paying");
    const fail = (msg: string, drop = false) => { if (drop) setPending(null); setPayPhase("idle"); setPayErr(msg); go("pagamento"); };
    const r = await payCard({ orderId, ...card });
    if (!r.ok) {
      if (r.installments) setCardInst(r.installments);
      fail(r.error);
      return;
    }
    if (r.status === "paid") { await celebrate(r.result, { fromButton: true, startedAt }); return; }
    if (r.status === "requires_action") {
      const a = await cardApi.current?.handleNextAction(r.clientSecret);
      if (!a || "error" in a) { fail(a?.error ?? "O banco não confirmou o pagamento. Tente de novo."); return; }
    }
    // aprovado no banco: o pedido é confirmado pelo webhook ou por esta conferência (o que chegar primeiro)
    for (let i = 0; i < 90; i++) {
      const c = await checkPayment(orderId);
      if (c.status === "paid") { await celebrate(c.result, { fromButton: true, startedAt }); return; }
      if (c.status === "failed") { fail(c.error); return; }
      if (c.status === "closed") { fail(c.error, true); return; }
      if (i === 8) setSlow(true);
      await sleep(i < 8 ? 1500 : 4000);
    }
    setSlow(true);
  }

  async function next() {
    if (expired || busy) return;
    if (step === "resumo") {
      if (!nq) { setTried(true); return; }
      go("dados");
    } else if (step === "dados") {
      if (!user) { setTried(true); nudgeLogin(); return; }
      if (dadosErr.length) { setTried(true); return; }
      if (free) {
        // nada a pagar: o pedido é confirmado e os ingressos saem na hora
        const startedAt = nowMs();
        setPayPhase("paying");
        const id = await orderFor("free");
        if (id) await finish(id, startedAt); else setPayPhase("idle");
        return;
      }
      go("pagamento");
    } else if (step === "pagamento") {
      if (pay === "pix") {
        // o Pix deste mesmo pedido ainda na memória (voltou sem cancelar): mostra o mesmo código
        const key = fpNow("pix");
        if (order && pendingRef.current?.orderId === order.orderId && pendingRef.current.key === key) { go("pix"); return; }
        const r = await submitOrder("pix");
        if (r) {
          setPending({ orderId: r.orderId, key });
          setOrder({ orderId: r.orderId, number: r.number, totalCents: r.totalCents, pixCode: r.pixCode, pixQrSvg: r.pixQrSvg, expiresAt: r.expiresAt, live: r.live, testUrl: r.hostedUrl });
          pixDeadline.current = r.expiresAt;
          setPixLeft(r.expiresAt ? secondsUntil(r.expiresAt) : PIX_SEG);
          setCopied(false);
          go("pix");
        }
      } else if (live) {
        if (saved === null) { setPayErr("Carregando seus cartões salvos. Tente de novo em um instante."); return; }
        if (!cardValid) { setTried(true); setPayErr(null); return; }
        setPayErr(null);
        setBusy(true);
        let card: Omit<PayCardInput, "orderId">;
        if (usingSaved) card = { paymentMethodId: cardSel, save: false, holder: null };
        else {
          // titular: nome impresso (sempre), e-mail do titular ou o de quem compra, endereço se informado
          const pm = await cardApi.current?.createPaymentMethod(
            { name: printed.toUpperCase(), email: other && holder.email.trim() ? holder.email.trim() : email, phone, address: billingAddress() },
            { save: saveCard, metadata: saveCard ? (other ? { cardholder: "outra_pessoa", holder_cpf: holderCpf } : { cardholder: "comprador" }) : undefined },
          );
          if (!pm || "error" in pm) { setBusy(false); setPayErr(pm?.error ?? "O formulário do cartão ainda está carregando."); return; }
          card = { paymentMethodId: pm.id, save: saveCard, holder: other ? { name: printed.toUpperCase(), cpf: holderCpf } : null };
        }
        // nova tentativa sem mudar nada: reaproveita o pedido (e o PaymentIntent) pendente
        const startedAt = nowMs();
        setPayPhase("paying");
        const orderId = await orderFor("card");
        if (!orderId) { setBusy(false); setPayPhase("idle"); return; }
        setBusy(false);
        await payLive(orderId, card, startedAt);
      } else {
        if (!cardValid) { setTried(true); return; }
        const startedAt = nowMs();
        setPayPhase("paying");
        const orderId = await orderFor("card");
        if (orderId) await finish(orderId, startedAt); else setPayPhase("idle");
      }
    }
  }

  const prev = () => {
    // saindo do Pix: cancela o código gerado (e o pedido) para não pagar duas vezes nem deixar pedido aberto
    if (step === "pix" && order) { void abandonPayment(order.orderId); setOrder(null); setPending(null); }
    go(step === "dados" ? "resumo" : step === "pagamento" ? "dados" : "pagamento");
  };
  /** Desiste do pedido retomado: cancela e volta para a escolha com os mesmos ingressos. */
  async function dropResume() {
    const id = pendingRef.current?.orderId;
    if (!id || busy) return;
    setBusy(true);
    const r = await abandonPayment(id);
    if (r.paid) { window.location.assign(`/meus-ingressos?pedido=${r.paid}`); return; }
    if (r.paying) { setBusy(false); flash("O pagamento deste pedido já está sendo confirmado. Confira em Meus ingressos em instantes."); return; }
    setPending(null);
    setOrder(null);
    window.location.assign(`${urlFor("resumo")}&aviso=cancelado`);
  }
  /** Já paguei: confere na hora (o checkout também confere sozinho a cada 3 s). */
  async function checkPixNow() {
    if (!order) return;
    setBusy(true);
    const r = await checkPayment(order.orderId);
    setBusy(false);
    if (r.status === "paid") void celebrate(r.result, { fromButton: false });
    else if (r.status === "pending") flash("Ainda não recebemos o Pix. Assim que cair, a confirmação aparece aqui.");
    else { flash(r.error); setOrder(null); setPending(null); go("pagamento"); }
  }
  const idx = STEP_INDEX[step];
  const steps = ["Resumo", "Dados", free ? "Sem pagamento" : "Pagamento", "Confirmação"].map((label, i) => ({
    label, n: String(i + 1), cls: i < idx ? "ok" : i === idx ? "cur" : "",
    go: () => { if (i < idx && idx < 3 && step !== "proc") go((["resumo", "dados", "pagamento"] as const)[i]); },
  }));
  const ctaLabel = step === "resumo" ? "Continuar" : step === "dados" ? (user ? (free ? "Garantir ingresso" : "Ir para pagamento") : "Entrar para continuar") : step === "pagamento" ? (pay === "card" ? `Pagar ${money(price.total)}` : "Gerar código Pix") : "";
  const payLabel = done ? (done.method === "free" ? "Gratuito" : done.method === "card" ? `Cartão · ${done.installments}x` : "Pix") : free ? "Gratuito" : pay === "card" ? `Cartão${live ? "" : ` ${cardBrand(cc.num)}`} · ${inst}x` : "Pix";
  const totalCents = done ? done.totalCents : order && step === "pix" ? order.totalCents : price.total;
  const totalLabel = nq || done ? priceOf(totalCents) : money(0);

  return (
    <main className="wrap ck">
      {queueEventId && step !== "done" && <QueueGate eventId={queueEventId} title={event.title} />}
      {step !== "done" && (
        <div className="ck-top">
          <Link className="ck-back" href={lock?.back ?? `/eventos/${event.slug}`}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
            {lock?.kind === "grupo" ? "Voltar ao grupo" : "Voltar ao evento"}
          </Link>
          <ol className="steps" aria-label="Etapas da compra">
            {steps.map((st) => (
              <li key={st.n} className={st.cls}>
                <button className="st-b" type="button" onClick={st.go} aria-current={st.cls === "cur" ? "step" : undefined}>
                  <span className="st-n">{st.n}</span>
                  <span className="st-l">{st.label}</span>
                </button>
              </li>
            ))}
          </ol>
          {step !== "pix" && !expired && (
            <span className={left < 120 ? "tmr low" : "tmr"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              Reservados por <b className="tm-v">{mmss(left)}</b>
            </span>
          )}
        </div>
      )}

      {expired && (
        <div className="exp">
          <div>
            <b className="exp-t">O tempo da reserva acabou</b>
            <span className="exp-s">Seus ingressos voltaram para a venda. Escolha de novo para garantir o lugar.</span>
          </div>
          <Link className="go2" href={`/eventos/${event.slug}`}>Escolher de novo</Link>
        </div>
      )}

      {notice && step === "resumo" && !expired && (
        <div className="ck-note" role="status">
          <span className="ck-note-i" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </span>
          <span className="ck-note-t">{notice}</span>
        </div>
      )}

      {resume && pendingId === resume.orderId && !expired && (step === "pagamento" || step === "pix") && (
        <div className="rsm" role="status">
          <span className="rsm-i" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /></svg>
          </span>
          <span className="rsm-t">
            <b>Pedido #{resume.number} aguardando pagamento</b>
            <span>Continuamos de onde você parou: mesmos ingressos, titulares e valor. A reserva vale enquanto o tempo não acabar.</span>
          </span>
          <button className="rsm-x" type="button" onClick={() => void dropResume()} disabled={busy}>Cancelar pedido</button>
        </div>
      )}

      {step !== "done" && (
        <div className="ck-g">
          <section className="ck-main">
            {step === "resumo" && (
              <div className="pane">
                <h1 className="ck-h">Revise seu pedido</h1>
                <p className="ck-p">{lock ? lock.title : "Confira os ingressos antes de seguir. Dá para ajustar as quantidades aqui."}</p>
                {lock && (
                  <div className="lockc">
                    {lines.map((l) => (
                      <div className="lk-row" key={l.ticketTypeId}>
                        <span className="lk-ic" aria-hidden="true">{lock.kind === "grupo"
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9.5" r="2.6" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14.5 19a4 4 0 0 1 6.5-3" /></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>}</span>
                        <span className="lk-i"><b>{l.name}</b><small>1 ingresso · {lock.kind === "grupo" ? "parte do grupo" : "revenda oficial"}</small></span>
                        <b className="lk-p">{priceOf(l.priceCents)}</b>
                      </div>
                    ))}
                    <p className="lk-n">{lock.note}</p>
                  </div>
                )}
                {!lock && multiDay && (
                  <>
                    <span className="sess-l">Escolha a data</span>
                    <div className="sess-p" role="radiogroup" aria-label="Datas">
                      {event.sessions.map((s) => {
                        const n = event.tiers.filter((t) => t.sessionId === s.id).reduce((acc, t) => acc + (qty[t.id] ?? 0), 0);
                        return (
                          <button key={s.id} type="button" role="radio" aria-checked={session === s.id} className={session === s.id ? "pd on" : "pd"} onClick={() => setSession(s.id)}>
                            <span className="pd-w">{s.wd}</span><b className="pd-d">{s.day}</b><span className="pd-c">{s.sub}</span>
                            {n > 0 && <i className="pd-n">{n}</i>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {!lock && <div className="trs">
                  {groups.map((g) => {
                    if (!g.name) return g.tiers.map((t) => <TierRow key={t.id} t={t} q={qty[t.id] ?? 0} sub={t.desc || (multiDay ? "" : t.note)} onQty={setTierQty} />);
                    const key = `${dayKey}|${g.name}`;
                    const sel = g.tiers.reduce((acc, t) => acc + (qty[t.id] ?? 0), 0);
                    const open = openSecs[key] ?? g === firstSec;
                    const avail = g.tiers.filter((t) => t.open);
                    const from = Math.min(...(avail.length ? avail : g.tiers).map((t) => t.priceCents));
                    return (
                      <div key={key} className={open ? "tg open" : "tg"}>
                        <button className="tg-h" type="button" aria-expanded={open} onClick={() => setOpenSecs((o) => ({ ...o, [key]: !open }))}>
                          <i className="sec-sw" style={{ background: g.color ?? "#111" }} aria-hidden="true" />
                          <b className="tg-t">{g.name}</b>
                          {sel > 0 && <i className="tg-n">{sel}</i>}
                          <span className="tg-from">{from ? `a partir de ${money(from)}` : "Grátis"}</span>
                          <span className="tg-c" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
                        </button>
                        {/* sempre montado: a altura anima de 0 até o conteúdo (grid 0fr → 1fr) */}
                        <div className="tg-bw" inert={!open}>
                          <div className="tg-bi">
                            <div className="tg-b">
                              {g.tiers.map((t, i) => <TierRow key={t.id} t={t} q={qty[t.id] ?? 0} label={t.type} sub={t.desc || (multiDay ? "" : t.note)} onQty={setTierQty} delay={i} />)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>}
                {tried && !nq && <p className="err">Escolha pelo menos um ingresso para continuar.</p>}
                {!lock && <div className="cupb">
                  <span className="cup-i" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>
                  </span>
                  <input className="cup-in" type="text" placeholder="Cupom de desconto" value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCupErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }} aria-label="Cupom de desconto" />
                  <button className="cup-b" type="button" onClick={() => void applyCoupon()}>Aplicar</button>
                </div>}
                {(coupon || cupErr) && (
                  <p className={cupErr ? "errm" : "okm"}>{cupErr ?? `Cupom ${coupon?.code} aplicado: ${coupon?.percentOff ? `${coupon.percentOff}% de desconto` : `${money(coupon?.amountOffCents ?? 0)} de desconto`}.`}</p>
                )}
                <div className="know">
                  <Know icon={<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" />} title="Ingressos nominais" text="Na próxima etapa você diz quem vai usar cada ingresso. Os de outras pessoas vão por e-mail para elas." />
                  {!lock && <Know icon={<path d="M4 7h16M4 12h10M4 17h7" />} title="Meia-entrada" text="Estudantes, PcD, jovens de baixa renda e maiores de 60. Marque na etapa de dados e leve o documento." />}
                  <Know icon={<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />} title="Cancelamento" text="Até 7 dias após a compra, desde que falte mais de 48h para o evento." />
                </div>
              </div>
            )}

            {step === "dados" && (
              <div className="pane">
                <h1 className="ck-h">Seus dados</h1>
                <p className="ck-p">{free ? "Usamos esses dados para enviar os ingressos. Nada é cobrado: o ingresso é grátis." : "Usamos esses dados para enviar os ingressos e emitir o comprovante."}</p>
                {user ? (
                  <span className="hint ck-acc">
                    Comprando como <b className="hint-b">{user.email}</b>
                  </span>
                ) : (
                  <div ref={authRef}>
                    <InlineAuth onDone={() => router.refresh()} returnUrl={urlFor("dados")} highlight={authNudge || tried} human={human ?? null} apple={apple} />
                  </div>
                )}
                <div className="fg2">
                  <label className="lf2">
                    <span className="lf2-l">Nome completo</span>
                    <input className={bad(isFullName(name))} type="text" placeholder="Como está no documento" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </label>
                  <label className="lf2">
                    <span className="lf2-l">E-mail</span>
                    <input className={bad(isEmail(email))} type="email" placeholder="nome@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </label>
                  <div className="lf2">
                    <span className="lf2-l">Celular</span>
                    <PhoneField className={bad(phoneValid(phone))} value={phone} onChange={setPhone} />
                  </div>
                  <label className="lf2">
                    <span className="lf2-l">CPF <em className="lf2-req">obrigatório</em></span>
                    <input className={bad(cpfValid(cpf))} type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(fmtCpf(e.target.value))} required aria-required="true" autoComplete="off" />
                  </label>
                </div>
                {tried && user && dadosErr.length > 0 && <p className="err">Falta preencher: {dadosErr.join(", ")}.</p>}
                <h2 className="ck-h2">Quem vai usar os ingressos</h2>
                <p className="ck-p">Cada ingresso é nominal. Quem não for você recebe o ingresso por e-mail e precisa entrar ou criar uma conta para ficar com ele.</p>
                <div className="holds">
                  {holders.map((h) => {
                    const hd = hdOf(h);
                    const upd = (patch: Partial<Hold>) => setHold((o) => ({ ...o, [h.key]: { ...blankHold(h), ...o[h.key], ...patch } }));
                    /* "Sou eu" vale para um ingresso só: marcar aqui desmarca o outro */
                    const toggleMe = () => setHold((o) => {
                      const nx: Record<string, Hold> = {};
                      for (const x of holders) {
                        const cur = o[x.key] ?? blankHold(x);
                        nx[x.key] = x.key === h.key ? { ...cur, me: !hd.me } : cur.me ? { ...cur, me: false, name: "" } : cur;
                      }
                      return nx;
                    });
                    const emErr = tried ? holdEmailErr.get(h.key) : undefined;
                    return (
                      <div key={h.key} className={hd.me ? "hold mine" : "hold"}>
                        <div className="hold-h">
                          <span className="hold-n">Ingresso {h.n}</span>
                          <span className="hold-t">{h.tier.name}</span>
                          <button className={hd.me ? "me on" : "me"} type="button" onClick={toggleMe} aria-pressed={hd.me}>Sou eu</button>
                        </div>
                        {hd.me ? (
                          <div className="hold-me">
                            <span className="hold-av" aria-hidden="true">{(name.trim()[0] ?? "?").toUpperCase()}</span>
                            <span className="hold-mi">
                              <b className={tried && !isFullName(name) ? "bad" : undefined}>{name.trim() || "Seu nome completo (acima)"}</b>
                              <small>Fica na sua conta{user?.email ? ` · ${user.email}` : ""}</small>
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="hold-f">
                              <input className={tried && !isFullName(hd.name) ? "in2 bad" : "in2"} type="text" placeholder="Nome de quem vai usar" value={hd.name} onChange={(e) => upd({ name: e.target.value })} autoComplete="off" aria-label={`Nome do titular do ingresso ${h.n}`} />
                              <input className={emErr ? "in2 bad" : "in2"} type="email" inputMode="email" placeholder="E-mail de quem vai usar" value={hd.email} onChange={(e) => upd({ email: e.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label={`E-mail de quem vai receber o ingresso ${h.n}`} aria-invalid={!!emErr} />
                            </div>
                            {emErr ? <p className="hold-err" role="alert">{emErr}</p> : <p className="hold-tip">Depois do pagamento, enviamos o ingresso para este e-mail. A pessoa entra ou cria uma conta com ele para receber.</p>}
                          </>
                        )}
                        {h.tier.meiaOk && (
                          <button className={hd.meia ? "ckb on" : "ckb"} type="button" role="checkbox" aria-checked={hd.meia} onClick={() => upd({ meia: !hd.meia })}>
                            <span className="ck-box" aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                            </span>
                            <span className="ck-t">Meia-entrada <span className="ck-sub">· {money(Math.round(h.tier.priceCents / 2))}, apresentar documento</span></span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* com a Stripe, o cartão continua montado (escondido) durante a confirmação: o 3D Secure usa o mesmo Stripe.js */}
            {(step === "pagamento" || (live && step === "proc" && pay === "card")) && (
              <div className="pane" hidden={step !== "pagamento"}>
                <h1 className="ck-h">Pagamento</h1>
                <p className="ck-p">Escolha como prefere pagar. Os ingressos chegam no seu e-mail assim que o pagamento é aprovado.</p>
                <div className="pm" role="radiogroup" aria-label="Forma de pagamento">
                  <button className={pay === "pix" ? "pmo on" : "pmo"} type="button" role="radio" aria-checked={pay === "pix"} onClick={() => { setPay("pix"); setTried(false); setPayErr(null); }}>
                    <span className="pm-r" aria-hidden="true" />
                    <span className="pm-ic" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2.8l4.2 4.2-4.2 4.2L7.8 7z" /><path d="M12 12.8l4.2 4.2-4.2 4.2-4.2-4.2z" /><path d="M2.8 12l4.2-4.2 4.2 4.2-4.2 4.2z" /><path d="M12.8 12l4.2-4.2 4.2 4.2-4.2 4.2z" /></svg>
                    </span>
                    <span className="pm-i"><b className="pm-t">Pix</b><span className="pm-s">Aprovação na hora</span></span>
                    <span className="pm-tag">Recomendado</span>
                  </button>
                  <button className={pay === "card" ? "pmo on" : "pmo"} type="button" role="radio" aria-checked={pay === "card"} onClick={() => { setPay("card"); setTried(false); setPayErr(null); }}>
                    <span className="pm-r" aria-hidden="true" />
                    <span className="pm-ic" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6.5 15h4" /></svg>
                    </span>
                    <span className="pm-i"><b className="pm-t">Cartão de crédito</b><span className="pm-s">Em até 6x</span></span>
                  </button>
                </div>
                {pay === "pix" ? (
                  <div className="pixinfo">
                    <p className="ck-p">Ao continuar, geramos um QR code Pix que vale por 15 minutos. Pague pelo app do seu banco e a confirmação aparece aqui sozinha.</p>
                  </div>
                ) : (
                  <div className="cardf">
                    {live && saved === null && (
                      <div className="scl" aria-busy="true">
                        <span className="sco-sk" /><span className="sco-sk" />
                        <span className="sr" role="status">Carregando seus cartões salvos…</span>
                      </div>
                    )}
                    {live && saved && saved.length > 0 && (
                      <div className="scl" role="radiogroup" aria-label="Cartões salvos">
                        {saved.map((c) => (
                          <button key={c.id} className={`sco${cardSel === c.id ? " on" : ""}`} type="button" role="radio" aria-checked={cardSel === c.id} disabled={c.expired} onClick={() => pickCard(c.id)}>
                            <span className="pm-r" aria-hidden="true" />
                            <CardBrand brand={c.brand} />
                            <span className="sco-i">
                              <b>{c.brand} <span className="sco-d">•••• {c.last4}</span></b>
                              <small>{c.expired ? "Vencido" : `Validade ${expLabel(c.expMonth, c.expYear)}`}{c.holder ? ` · ${c.holder}` : ""}</small>
                            </span>
                            {c.isDefault && !c.expired && <span className="sco-tag">Principal</span>}
                          </button>
                        ))}
                        <button className={`sco new${cardSel === "new" ? " on" : ""}`} type="button" role="radio" aria-checked={cardSel === "new"} onClick={() => pickCard("new")}>
                          <span className="pm-r" aria-hidden="true" />
                          <span className="cbr add" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
                          </span>
                          <span className="sco-i"><b>Usar outro cartão</b><small>Crédito de qualquer bandeira</small></span>
                        </button>
                      </div>
                    )}

                    {/* cartão novo: com cartão salvo escolhido fica escondido (o formulário continua montado para o 3D Secure) */}
                    <div className="cd-new" hidden={usingSaved || (live && saved === null)}>
                      {live && stripeKey ? <StripeCard publishableKey={stripeKey} amountCents={price.total} ref={cardApi} /> : (
                        <div className="fg2 cd-tf">
                          <label className="lf2 span2">
                            <span className="lf2-l">Número do cartão</span>
                            <span className="cd-numw">
                              <input className={bad(ccOk.num)} type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" value={cc.num} onChange={(e) => setCc((o) => ({ ...o, num: fmtCard(e.target.value) }))} autoComplete="cc-number" aria-invalid={tried && !ccOk.num} />
                              {onlyDigits(cc.num).length >= 1 && <span className="cd-bd">{cardBrand(cc.num)}</span>}
                            </span>
                          </label>
                          <label className="lf2">
                            <span className="lf2-l">Validade</span>
                            <input className={bad(ccOk.exp)} type="text" inputMode="numeric" placeholder="MM/AA" value={cc.exp} onChange={(e) => setCc((o) => ({ ...o, exp: fmtExp(e.target.value) }))} autoComplete="cc-exp" aria-invalid={tried && !ccOk.exp} />
                          </label>
                          <label className="lf2">
                            <span className="lf2-l">Código de segurança</span>
                            <input className={bad(ccOk.cvv)} type="text" inputMode="numeric" placeholder="CVV" value={cc.cvv} onChange={(e) => setCc((o) => ({ ...o, cvv: onlyDigits(e.target.value).slice(0, 4) }))} autoComplete="cc-csc" aria-invalid={tried && !ccOk.cvv} />
                          </label>
                        </div>
                      )}
                      <label className="lf2 cd-name">
                        <span className="lf2-l">{other ? "Nome do titular, como impresso no cartão" : "Nome impresso no cartão"}</span>
                        <input className={`${bad(ccOk.name)} cd-up`} type="text" placeholder="Como aparece no cartão" value={cardName ?? (other ? "" : name)} onChange={(e) => setCardName(e.target.value.replace(/[^\p{L}' .-]/gu, "").slice(0, 80))} autoComplete="cc-name" autoCapitalize="characters" spellCheck={false} aria-invalid={tried && !ccOk.name} />
                      </label>

                      <label className={other ? "cd-tg on" : "cd-tg"}>
                        <input className="sr" type="checkbox" role="switch" checked={other} onChange={(e) => {
                          const on = e.target.checked;
                          setOther(on);
                          // o nome veio do comprador: com o cartão de outra pessoa, começa vazio
                          if (on && cardName !== null && cardName.trim() === name.trim()) setCardName(null);
                          setTried(false);
                        }} />
                        <span className="cd-tg-t">
                          <b>O cartão é de outra pessoa?</b>
                          <small>Por exemplo, de um familiar. Os ingressos continuam no seu nome e na sua conta.</small>
                        </span>
                        <span className="cd-sw" aria-hidden="true" />
                      </label>

                      {other && (
                        <div className="cd-hold">
                          <span className="cd-hold-t">Dados do titular do cartão</span>
                          <div className="fg2">
                            <label className="lf2">
                              <span className="lf2-l">CPF do titular</span>
                              <input className={bad(ccOk.cpf)} type="text" inputMode="numeric" placeholder="000.000.000-00" value={holder.cpf} onChange={(e) => setHolder((o) => ({ ...o, cpf: fmtCpf(e.target.value) }))} autoComplete="off" aria-invalid={tried && !ccOk.cpf} />
                            </label>
                            <label className="lf2">
                              <span className="lf2-l">E-mail do titular <em className="lf2-req">opcional</em></span>
                              <input className={bad(ccOk.email)} type="email" inputMode="email" placeholder="nome@email.com" value={holder.email} onChange={(e) => setHolder((o) => ({ ...o, email: e.target.value }))} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={tried && !ccOk.email} />
                            </label>
                          </div>
                          {tried && sameCpf && <p className="hold-err" role="alert">Esse é o seu CPF. Se o cartão é seu, desligue “O cartão é de outra pessoa?”.</p>}
                          <button className={addrOpen ? "cd-more on" : "cd-more"} type="button" aria-expanded={addrOpen} aria-controls="cd-addr" onClick={() => setAddrOpen((v) => !v)}>
                            <span>Endereço de cobrança <em>opcional</em></span>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                          </button>
                          {addrOpen && (
                            <div className="cd-addr" id="cd-addr">
                              <label className="lf2 a-cep">
                                <span className="lf2-l">CEP {cepBusy && <em className="lf2-req">buscando…</em>}</span>
                                <input className={tried && addrUsed && !addrOk.cep ? "in2 bad" : "in2"} type="text" inputMode="numeric" placeholder="00000-000" value={addr.cep} onChange={(e) => { const v = fmtCep(e.target.value); setA({ cep: v }); if (onlyDigits(v).length === 8) void lookupCep(v); }} autoComplete="billing postal-code" />
                              </label>
                              <label className="lf2 a-st">
                                <span className="lf2-l">Rua</span>
                                <input className={tried && addrUsed && !addrOk.street ? "in2 bad" : "in2"} type="text" value={addr.street} onChange={(e) => setA({ street: e.target.value })} autoComplete="billing address-line1" />
                              </label>
                              <label className="lf2 a-n">
                                <span className="lf2-l">Número</span>
                                <input ref={numRef} className={tried && addrUsed && !addrOk.number ? "in2 bad" : "in2"} type="text" inputMode="numeric" value={addr.number} onChange={(e) => setA({ number: e.target.value.slice(0, 12) })} autoComplete="off" />
                              </label>
                              <label className="lf2 a-c">
                                <span className="lf2-l">Complemento <em className="lf2-req">opcional</em></span>
                                <input className="in2" type="text" value={addr.complement} onChange={(e) => setA({ complement: e.target.value })} autoComplete="billing address-line2" />
                              </label>
                              <label className="lf2 a-b">
                                <span className="lf2-l">Bairro</span>
                                <input className="in2" type="text" value={addr.district} onChange={(e) => setA({ district: e.target.value })} autoComplete="off" />
                              </label>
                              <label className="lf2 a-ci">
                                <span className="lf2-l">Cidade</span>
                                <CitySelect className="in2" invalid={tried && addrUsed && !addrOk.city} uf={addr.uf} value={addr.city} onChange={(city) => setA({ city })} />
                              </label>
                              <label className="lf2 a-uf">
                                <span className="lf2-l">UF</span>
                                <UfSelect className="in2" short invalid={tried && addrUsed && !addrOk.uf} value={addr.uf} onChange={(uf) => setA({ uf })} autoComplete="billing address-level1" />
                              </label>
                              {cepMsg && <p className="cd-cepm span-all" role="status">{cepMsg}</p>}
                            </div>
                          )}
                          <p className="cd-tip">O CPF do titular é usado só para validar este pagamento com o banco.</p>
                        </div>
                      )}

                      {live && (
                        <button className={saveCard ? "ckb cd-save on" : "ckb cd-save"} type="button" role="checkbox" aria-checked={saveCard} onClick={() => setSaveCard((v) => !v)}>
                          <span className="ck-box" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                          </span>
                          <span className="ck-t">Salvar este cartão para as próximas compras<span className="ck-sub">Na sua conta aparecem só a bandeira e os 4 últimos dígitos.</span></span>
                        </button>
                      )}
                      {tried && !cardValid && <p className="err" role="alert">Confira: {cardErr.join(", ")}.</p>}
                    </div>

                    <h2 className="ck-h3">Parcelas</h2>
                    <div className="inst" role="radiogroup" aria-label="Parcelas">
                      {installments.map((o) => {
                        // o banco disse quais parcelas este cartão aceita: as outras ficam marcadas (ainda dá para trocar de cartão)
                        const no = !!cardInst && o.n > 1 && !cardInst.includes(o.n);
                        return (
                          <button key={o.n} className={`ino${o.n === inst ? " on" : ""}${no ? " off" : ""}`} type="button" role="radio" aria-checked={o.n === inst} onClick={() => { setInst(o.n); setPayErr(null); }}>
                            <b className="in-n">{o.n}x <span className="in-v">{money(o.eachCents)}</span></b>
                            <span className="in-s">{no ? "indisponível neste cartão" : o.interestFree ? "sem juros" : `com juros · total ${money(o.totalCents)}`}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="cd-tot" aria-live="polite">
                      <span className="cd-tot-k">Total no cartão</span>
                      <b className="cd-tot-v">{money(price.total)}</b>
                      <span className="cd-tot-s">{inst === 1 ? "à vista, em 1x" : `${inst}x de ${money(installments.find((o) => o.n === inst)?.eachCents ?? Math.round(price.total / inst))} ${inst <= 3 ? "sem juros" : `com juros (${money(price.interest)})`}`}</span>
                    </div>
                  </div>
                )}
                {payErr && <p className="err pay-err" role="alert">{payErr}</p>}
                {live ? (
                  <p className={pay === "card" ? "cd-sec" : "ck-test"}>
                    {pay === "card" && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
                    <span>Pagamento seguro, com conexão criptografada.{pay !== "card" ? "" : usingSaved
                      ? " O cartão salvo fica guardado com segurança pelo nosso processador de pagamentos: a Tickets Win só vê a bandeira e os últimos dígitos."
                      : saveCard
                        ? " O cartão fica guardado com segurança pelo nosso processador de pagamentos: a Tickets Win só mostra a bandeira e os últimos dígitos. Dá para remover quando quiser em Minha conta › Pagamentos."
                        : " Os dados do cartão não ficam salvos na Tickets Win."}</span>
                  </p>
                ) : <p className="ck-test">Ambiente de teste: nenhuma cobrança real é feita e os dados do cartão não saem do seu navegador.</p>}
              </div>
            )}

            {step === "pix" && order && (
              <div className="pane">
                <h1 className="ck-h">Pague com Pix</h1>
                <p className="ck-p">Abra o app do seu banco, escolha pagar com Pix e escaneie o código. Se estiver no celular, use o copia e cola.</p>
                <div className="pixb">
                  <div className="pix-qr">
                    <span className="qr qr-svg" role="img" aria-label="QR code Pix" dangerouslySetInnerHTML={{ __html: order.pixQrSvg }} />
                  </div>
                  <div className="pix-i">
                    <span className="pix-k">Valor</span>
                    <b className="pix-v">{money(order.totalCents)}</b>
                    <span className={pixLeft < 120 ? "pix-exp low" : "pix-exp"}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      {pixLeft > 0 ? <>Código expira em <b className="tm-v">{mmss(pixLeft)}</b></> : <b>Código expirado</b>}
                    </span>
                    <div className="cc2">
                      <span className="cc2-v">{order.pixCode}</span>
                      <button className="cc2-b" type="button" onClick={() => { void navigator.clipboard?.writeText(order.pixCode).catch(() => {}); setCopied(true); flash("Código Pix copiado"); }}>{copied ? "Copiado" : "Copiar código"}</button>
                    </div>
                    <ol className="howto">
                      <li>Abra o app do seu banco</li>
                      <li>Escolha Pix › Ler QR code ou Copia e cola</li>
                      <li>{order.live ? `Confira o valor (${money(order.totalCents)}) e confirme` : "Confira o valor e o recebedor Tickets Win e confirme"}</li>
                    </ol>
                    {order.live ? (
                      pixLeft > 0 ? <>
                        <span className="pix-wait" aria-live="polite"><span className="pw-dot" aria-hidden="true" />Aguardando pagamento · a confirmação aparece aqui sozinha</span>
                        <button className="sec2 pix-chk" type="button" onClick={() => void checkPixNow()} disabled={busy}>{busy ? "Conferindo…" : "Já paguei"}</button>
                        {order.testUrl && <a className="pix-test" href={order.testUrl} target="_blank" rel="noopener noreferrer">Modo de teste: simular o pagamento deste Pix ↗</a>}
                      </> : <>
                        <span className="pix-wait">O código expirou e nada foi cobrado.</span>
                        <button className="go2" type="button" onClick={prev}>Gerar novo pagamento</button>
                      </>
                    ) : <>
                      <span className="pix-wait"><span className="pw-dot" aria-hidden="true" />Aguardando pagamento</span>
                      <button className="go2" type="button" onClick={() => void finish(order.orderId)} disabled={busy || expired}>Já fiz o pagamento</button>
                      <span className="ck-test">Ambiente de teste: o pagamento é confirmado ao clicar.</span>
                    </>}
                  </div>
                </div>
              </div>
            )}

            {step === "proc" && (
              <div className="pane proc">
                <div className="ld-tk proc-tk" aria-hidden="true">
                  <div className="ld-main">
                    <span className="ld-k">Tickets Win · {free ? "Ingressos" : "Pagamento"}</span>
                    <b className="ld-t">{event.title}</b>
                    <span className="ld-d">{totalLabel} · {payLabel}</span>
                    <span className="ld-bar"><i /></span>
                  </div>
                  <div className="ld-stub"><span className="ld-code" /></div>
                </div>
                <h1 className="ck-h">{free ? "Emitindo seus ingressos" : slow ? "Aguardando a confirmação do banco" : "Processando pagamento"}</h1>
                <p className="ck-p">{slow
                  ? <>O banco ainda está confirmando o pagamento. Pode deixar esta página aberta: assim que aprovar, os ingressos aparecem aqui, chegam no seu e-mail e ficam em <Link href="/meus-ingressos">Meus ingressos</Link>.</>
                  : "Isso leva só alguns segundos. Não feche esta página."}</p>
              </div>
            )}
          </section>

          <aside className="ck-side" aria-label="Resumo do pedido">
            <div className="sm">
              <div className="sm-ev">
                <div className="sm-art"><FlyerArt id={event.flyerId} /></div>
                <div className="sm-ei">
                  <b className="sm-t">{event.title}</b>
                  <span className="sm-d">{event.dateNice}</span>
                  <span className="sm-d">{event.venue} · {event.city}</span>
                </div>
              </div>
              <ul className="sm-l">
                {(lines.length ? lines : [{ ticketTypeId: "x", name: "Nenhum ingresso", quantity: 0, priceCents: 0 }]).map((l) => (
                  <li key={l.ticketTypeId} className="sm-li">
                    <span className="sm-ln">
                      {l.quantity ? `${l.quantity}× ${l.name}` : l.name}
                      {/* várias datas: a data saiu das linhas do resumo, então aparece aqui */}
                      {l.quantity > 0 && dayLabel(l.ticketTypeId) && <small className="sm-ld">{dayLabel(l.ticketTypeId)}</small>}
                    </span>
                    <span className="sm-lv">{l.quantity && !l.priceCents ? "Grátis" : money(l.quantity * l.priceCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="sm-rows">
                <Row k="Subtotal" v={money(price.subtotal)} />
                {price.meia > 0 && <Row k="Meia-entrada" v={`− ${money(price.meia)}`} ok />}
                {price.discount > 0 && <Row k={`Cupom ${coupon?.code ?? ""}`} v={`− ${money(price.discount)}`} ok />}
                <Row k="Taxa de serviço" v={free ? "Sem taxa" : event.feeRate ? money(price.fee) : "Inclusa no preço"} />
                {price.interest > 0 && <Row k="Juros do parcelamento" v={money(price.interest)} />}
              </div>
              <div className="sm-tot">
                <span className="sm-tk">Total</span>
                <b className="sm-tv">{totalLabel}</b>
              </div>
              {pay === "card" && step === "pagamento" && (
                <span className="sm-inst">{price.installments}x de {money(Math.round(price.total / price.installments))}{price.installments <= 3 ? " sem juros" : ""}</span>
              )}
              {(step === "resumo" || step === "dados" || step === "pagamento") && (
                <button
                  ref={ctaRef}
                  className={`go2 block tw-pay-btn${payPhase === "paying" ? " is-paying" : payPhase === "approved" ? " is-paying is-approved" : ""}`}
                  type="button" onClick={() => void next()} disabled={busy || expired || payPhase !== "idle"} aria-live="polite"
                >
                  {payPhase === "paying" && <span className="tw-spin" aria-hidden="true" />}
                  {payPhase === "approved" && <span className="tw-mini-check" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MINI_CHECK }} />}
                  <span data-label>{payPhase === "paying" ? "Processando pagamento" : payPhase === "approved" ? "Pagamento aprovado" : busy ? "Aguarde…" : ctaLabel}</span>
                  <svg className="tw-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </button>
              )}
              {(step === "dados" || step === "pagamento" || step === "pix") && (
                <button className="back2" type="button" onClick={prev}>Voltar</button>
              )}
              <span className="sm-sec">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                Pagamento seguro. Seus dados são criptografados.
              </span>
            </div>
          </aside>
        </div>
      )}

      {step === "done" && done && (
        <div className="done">
          <span className="done-ok" aria-hidden="true" data-tw-reveal="pop" style={{ "--i": 0 } as React.CSSProperties}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h1 className="done-h" data-tw-reveal style={{ "--i": 1 } as React.CSSProperties}>Pedido confirmado!</h1>
          <p className="done-p" data-tw-reveal style={{ "--i": 2 } as React.CSSProperties}>{done.sentTo.length >= done.ticketCount
            ? <>Enviamos a confirmação para <b className="done-b">{done.email || "seu e-mail"}</b> e cada ingresso para quem vai usar.</>
            : <>Enviamos os ingressos para <b className="done-b">{done.email || "seu e-mail"}</b>. Eles também já estão em Meus ingressos.</>}</p>
          <div className="ld-tk done-tk" data-tw-reveal="ticket" style={{ "--i": 3 } as React.CSSProperties}>
            <div className="ld-main">
              <span className="ld-k">Tickets Win · Ingresso · Pedido #{done.number}</span>
              <b className="ld-t">{event.title}</b>
              <span className="ld-d">{event.dateNice} · {event.venue}</span>
              <span className="dn-q">{done.ticketCount} {done.ticketCount === 1 ? "ingresso" : "ingressos"}</span>
            </div>
            <div className="ld-stub done-stub">
              {done.ticketQrSvg
                ? <span className="qr dn-qr qr-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: done.ticketQrSvg }} />
                : <span className="ld-code" aria-hidden="true" />}
            </div>
          </div>
          {done.sentTo.length > 0 && (
            <div className="dn-sent" data-tw-reveal style={{ "--i": 4 } as React.CSSProperties}>
              <b className="dn-sent-t">{done.sentTo.length === 1 ? "1 ingresso enviado por e-mail" : `${done.sentTo.length} ingressos enviados por e-mail`}</b>
              <ul className="dn-sent-l">
                {done.sentTo.map((x, i) => (
                  <li key={`${x.email}-${i}`}>
                    <span className="dn-sent-av" aria-hidden="true">{(x.name.trim()[0] ?? x.email[0] ?? "?").toUpperCase()}</span>
                    <span className="dn-sent-i"><b>{x.name || x.email}</b><small>{x.email} · aguardando</small></span>
                  </li>
                ))}
              </ul>
              <span className="dn-sent-s">Cada pessoa entra ou cria uma conta com esse e-mail para receber. Até lá, o ingresso fica com você em Meus ingressos, onde dá para reenviar ou cancelar.</span>
            </div>
          )}
          <div className="done-a" data-tw-reveal style={{ "--i": 5 } as React.CSSProperties}>
            <Link className="go2" href={`/meus-ingressos?pedido=${done.number}`}>Ver meus ingressos</Link>
            <a className="sec2" href={`/api/ingressos/${done.firstCode}/ics`} onClick={() => flash("Evento adicionado à sua agenda")}>Adicionar à agenda</a>
            <Link className="lk2" href="/">Voltar para o início</Link>
          </div>
          <div className="done-sum" data-tw-reveal style={{ "--i": 6 } as React.CSSProperties}>
            <div className="ds"><span className="ds-k">Pagamento</span><b className="ds-v">{payLabel}</b></div>
            <div className="ds"><span className="ds-k">Total pago</span><b className="ds-v">{priceOf(done.totalCents)}</b></div>
            <div className="ds"><span className="ds-k">Pedido</span><b className="ds-v">#{done.number}</b></div>
          </div>
        </div>
      )}
    </main>
  );
}

/** Linha de um tipo de ingresso no resumo; dentro de um setor mostra só o tipo (`label`), sem repetir setor e data. */
function TierRow({ t, q, label = t.name, sub, onQty, delay }: { t: CompraTier; q: number; label?: string; sub: string; onQty: (id: string, delta: number) => void; delay?: number }) {
  return (
    <div className={t.sold ? "trw so" : q > 0 ? "trw sel" : "trw"} style={delay !== undefined ? ({ "--i": delay } as React.CSSProperties) : undefined}>
      <div className="tr-i">
        <b className="tr-n">{label}</b>
        {sub && <span className="tr-o">{sub}</span>}
      </div>
      <span className={t.priceCents ? "tr-p" : "tr-p free"}>{priceOf(t.priceCents)}</span>
      {t.open ? (
        <div className="qt">
          <button className="qt-b" type="button" onClick={() => onQty(t.id, -1)} aria-label={`Remover um ${t.name}`}>−</button>
          <span className="qt-v">{q}</span>
          <button className="qt-b" type="button" onClick={() => onQty(t.id, 1)} aria-label={`Adicionar um ${t.name}`}>+</button>
        </div>
      ) : (
        <span className="tr-so">{t.sold ? "Esgotado" : "Em breve"}</span>
      )}
    </div>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className={ok ? "sm-r ok" : "sm-r"}>
      <span className="sm-k">{k}</span>
      <span className="sm-v">{v}</span>
    </div>
  );
}

function Know({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="kn">
      <span className="kn-i" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <div>
        <b className="kn-t">{title}</b>
        <span className="kn-s">{text}</span>
      </div>
    </div>
  );
}
