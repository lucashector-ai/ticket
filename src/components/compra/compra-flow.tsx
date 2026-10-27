"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { checkCoupon, confirmPayment, placeOrder, type ConfirmResult } from "@/lib/actions/compra";
import { installmentOptions, money, priceOrder } from "@/lib/pricing";
import { InlineAuth } from "./inline-auth";
import { cardBrand, expOk, fmtCard, fmtCpf, fmtExp, fmtPhone, isEmail, isFullName, mmss, onlyDigits } from "./format";
import { BrandMark } from "@/components/brand-logo";

export type CompraStep = "resumo" | "dados" | "pagamento" | "pix" | "proc" | "done";
/**
 * `name`: rótulo completo ("Pista · Inteira"), usado no resumo e nos titulares; `type`: só o tipo ("Inteira").
 * `meiaOk`: o titular pode marcar meia-entrada (tipos de inteira); meia e social já vêm com preço próprio.
 */
export type CompraTier = {
  id: string; name: string; type: string; note: string; desc: string | null; priceCents: number; open: boolean; sold: boolean;
  sector: string | null; sectorColor: string | null; sessionId: string | null; meiaOk: boolean;
};
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
type Hold = { name: string; me: boolean; meia: boolean };
type PixOrder = { orderId: string; number: number; totalCents: number; pixCode: string; pixQrSvg: string };

/** chave da data do ingresso no resumo ("" quando o evento tem uma data só) */
const dayOf = (e: CompraEvent, t: CompraTier) => (e.sessions.length ? t.sessionId ?? "" : "");
type TierGroup = { name: string | null; color: string | null; tiers: CompraTier[] };

const RESERVA_SEG = 600;
const PIX_SEG = 900;
const STEP_INDEX: Record<CompraStep, number> = { resumo: 0, dados: 1, pagamento: 2, pix: 2, proc: 2, done: 3 };

type Props = {
  event: CompraEvent;
  user: { id: string; name: string; email: string } | null;
  profile: { name: string; phone: string; cpf: string } | null;
  initialQty: Record<string, number>;
  initialCoupon: string | null;
  initialStep: CompraStep;
};

export function CompraFlow({ event, user, profile, initialQty, initialCoupon, initialStep }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const [step, setStep] = useState<CompraStep>(initialStep);
  const [qty, setQty] = useState<Record<string, number>>(initialQty);
  const [couponInput, setCouponInput] = useState(initialCoupon ?? "");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [cupErr, setCupErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [name, setName] = useState(profile?.name || user?.name || "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ? fmtPhone(profile.phone) : "");
  const [cpf, setCpf] = useState(profile?.cpf ? fmtCpf(profile.cpf) : "");
  const [hold, setHold] = useState<Record<string, Hold>>({});
  const [pay, setPay] = useState<"pix" | "card">("pix");
  const [inst, setInst] = useState(1);
  const [cc, setCc] = useState({ num: "", name: "", exp: "", cvv: "" });
  const [left, setLeft] = useState(RESERVA_SEG);
  const [pixLeft, setPixLeft] = useState(PIX_SEG);
  const [copied, setCopied] = useState(false);
  const [order, setOrder] = useState<PixOrder | null>(null);
  const [done, setDone] = useState<Extract<ConfirmResult, { ok: true }> | null>(null);
  const [busy, setBusy] = useState(false);
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

  /* cronômetros da reserva e do Pix */
  useEffect(() => {
    const iv = setInterval(() => {
      setLeft((l) => (l > 0 ? l - 1 : 0));
      setPixLeft((l) => (l > 0 ? l - 1 : 0));
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
    setPhone((p) => p || (profile?.phone ? fmtPhone(profile.phone) : ""));
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
    if (itens) p.set("itens", itens);
    if (coupon) p.set("cupom", coupon.code);
    if (s === "dados") p.set("etapa", "dados");
    return `/checkout?${p.toString()}`;
  }, [qty, coupon, event.slug]);
  useEffect(() => {
    if (step === "resumo" || step === "dados") window.history.replaceState(null, "", urlFor(step));
  }, [step, urlFor]);

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
  const holdName = (h: { key: string }) => (hold[h.key]?.name ?? "").trim();
  const dadosErr: string[] = [];
  if (!isFullName(name)) dadosErr.push("nome e sobrenome");
  if (!isEmail(email)) dadosErr.push("e-mail");
  if (onlyDigits(phone).length < 10) dadosErr.push("celular com DDD");
  if (onlyDigits(cpf).length !== 11) dadosErr.push("CPF com 11 dígitos");
  if (!holders.every((h) => isFullName(holdName(h)))) dadosErr.push("nome completo de cada titular");
  const ccOk = { num: onlyDigits(cc.num).length >= 15, name: cc.name.trim().length >= 3, exp: expOk(cc.exp), cvv: onlyDigits(cc.cvv).length >= 3 };
  const cardValid = ccOk.num && ccOk.name && ccOk.exp && ccOk.cvv;
  const bad = (ok: boolean) => (tried && !ok ? "in2 bad" : "in2");
  const expired = left <= 0 && step !== "done";

  const go = (s: CompraStep) => { setStep(s); setTried(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const setTierQty = (id: string, delta: number) => {
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

  async function submitOrder(method: "pix" | "card") {
    setBusy(true);
    const r = await placeOrder({
      eventSlug: event.slug,
      items: lines.map((l) => ({ ticketTypeId: l.ticketTypeId, quantity: l.quantity })),
      coupon: coupon?.code ?? null,
      buyer: { name, email, phone, cpf },
      holders: holders.map((h) => ({ ticketTypeId: h.tier.id, name: holdName(h), meia: isMeia(h) })),
      method,
      installments: method === "card" ? inst : 1,
    });
    setBusy(false);
    if (!r.ok) {
      flash(r.error);
      if (r.needsLogin) go("dados");
      return null;
    }
    return r;
  }

  async function finish(orderId: string) {
    go("proc");
    const r = await confirmPayment(orderId);
    if (!r.ok) { flash(r.error); go("pagamento"); return; }
    setDone(r);
    go("done");
    router.refresh();
  }

  async function next() {
    if (expired || busy) return;
    if (step === "resumo") {
      if (!nq) { setTried(true); return; }
      go("dados");
    } else if (step === "dados") {
      if (!user) { setTried(true); nudgeLogin(); return; }
      if (dadosErr.length) { setTried(true); return; }
      go("pagamento");
    } else if (step === "pagamento") {
      if (pay === "pix") {
        const r = await submitOrder("pix");
        if (r) { setOrder(r); setPixLeft(PIX_SEG); setCopied(false); go("pix"); }
      } else {
        if (!cardValid) { setTried(true); return; }
        const r = await submitOrder("card");
        if (r) await finish(r.orderId);
      }
    }
  }

  const prev = () => go(step === "dados" ? "resumo" : step === "pagamento" ? "dados" : "pagamento");
  const idx = STEP_INDEX[step];
  const steps = ["Resumo", "Dados", "Pagamento", "Confirmação"].map((label, i) => ({
    label, n: String(i + 1), cls: i < idx ? "ok" : i === idx ? "cur" : "",
    go: () => { if (i < idx && idx < 3 && step !== "proc") go((["resumo", "dados", "pagamento"] as const)[i]); },
  }));
  const ctaLabel = step === "resumo" ? "Continuar" : step === "dados" ? (user ? "Ir para pagamento" : "Entrar para continuar") : step === "pagamento" ? (pay === "card" ? `Pagar ${money(price.total)}` : "Gerar código Pix") : "";
  const payLabel = done ? (done.method === "card" ? `Cartão · ${done.installments}x` : "Pix") : pay === "card" ? `Cartão ${cardBrand(cc.num)} · ${inst}x` : "Pix";
  const totalLabel = money(done ? done.totalCents : order && step === "pix" ? order.totalCents : price.total);

  return (
    <main className="wrap ck">
      <div className="ck-top">
        <Link className="ck-back" href={`/eventos/${event.slug}`}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
          Voltar ao evento
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
        {step !== "done" && !expired && (
          <span className={left < 120 ? "tmr low" : "tmr"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            Reservados por <b className="tm-v">{mmss(left)}</b>
          </span>
        )}
      </div>

      {expired && (
        <div className="exp">
          <div>
            <b className="exp-t">O tempo da reserva acabou</b>
            <span className="exp-s">Seus ingressos voltaram para a venda. Escolha de novo para garantir o lugar.</span>
          </div>
          <Link className="go2" href={`/eventos/${event.slug}`}>Escolher de novo</Link>
        </div>
      )}

      {step !== "done" && (
        <div className="ck-g">
          <section className="ck-main">
            {step === "resumo" && (
              <div className="pane">
                <h1 className="ck-h">Revise seu pedido</h1>
                <p className="ck-p">Confira os ingressos antes de seguir. Dá para ajustar as quantidades aqui.</p>
                {multiDay && (
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
                <div className="trs">
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
                          <span className="tg-from">a partir de {money(from)}</span>
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
                </div>
                {tried && !nq && <p className="err">Escolha pelo menos um ingresso para continuar.</p>}
                <div className="cupb">
                  <span className="cup-i" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>
                  </span>
                  <input className="cup-in" type="text" placeholder="Cupom de desconto" value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCupErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }} aria-label="Cupom de desconto" />
                  <button className="cup-b" type="button" onClick={() => void applyCoupon()}>Aplicar</button>
                </div>
                {(coupon || cupErr) && (
                  <p className={cupErr ? "errm" : "okm"}>{cupErr ?? `Cupom ${coupon?.code} aplicado: ${coupon?.percentOff ? `${coupon.percentOff}% de desconto` : `${money(coupon?.amountOffCents ?? 0)} de desconto`}.`}</p>
                )}
                <div className="know">
                  <Know icon={<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" />} title="Ingressos nominais" text="Na próxima etapa você informa o nome de quem vai usar cada ingresso." />
                  <Know icon={<path d="M4 7h16M4 12h10M4 17h7" />} title="Meia-entrada" text="Estudantes, PcD, jovens de baixa renda e maiores de 60. Marque na etapa de dados e leve o documento." />
                  <Know icon={<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />} title="Cancelamento" text="Até 7 dias após a compra, desde que falte mais de 48h para o evento." />
                </div>
              </div>
            )}

            {step === "dados" && (
              <div className="pane">
                <h1 className="ck-h">Seus dados</h1>
                <p className="ck-p">Usamos esses dados para enviar os ingressos e emitir o comprovante.</p>
                {user ? (
                  <span className="hint ck-acc">
                    Comprando como <b className="hint-b">{user.email}</b>
                  </span>
                ) : (
                  <div ref={authRef}>
                    <InlineAuth onDone={() => router.refresh()} returnUrl={urlFor("dados")} highlight={authNudge || tried} />
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
                  <label className="lf2">
                    <span className="lf2-l">Celular</span>
                    <input className={bad(onlyDigits(phone).length >= 10)} type="tel" placeholder="(11) 90000-0000" value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} autoComplete="tel" />
                  </label>
                  <label className="lf2">
                    <span className="lf2-l">CPF</span>
                    <input className={bad(onlyDigits(cpf).length === 11)} type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(fmtCpf(e.target.value))} />
                  </label>
                </div>
                {tried && user && dadosErr.length > 0 && <p className="err">Falta preencher: {dadosErr.join(", ")}.</p>}
                <h2 className="ck-h2">Quem vai usar os ingressos</h2>
                <p className="ck-p">Cada ingresso é nominal. O nome aparece no QR code e é conferido na entrada com documento.</p>
                <div className="holds">
                  {holders.map((h, i) => {
                    const hd = hold[h.key] ?? { name: "", me: false, meia: false };
                    const upd = (patch: Partial<Hold>) => setHold((o) => ({ ...o, [h.key]: { ...{ name: "", me: false, meia: false }, ...o[h.key], ...patch } }));
                    return (
                      <div key={h.key} className="hold">
                        <div className="hold-h">
                          <span className="hold-n">Ingresso {h.n}</span>
                          <span className="hold-t">{h.tier.name}</span>
                          {i === 0 && (
                            <button className={hd.me ? "me on" : "me"} type="button" onClick={() => upd(hd.me ? { me: false, name: "" } : { me: true, name })}>Sou eu</button>
                          )}
                        </div>
                        <input className={tried && !isFullName(hd.name) ? "in2 bad" : "in2"} type="text" placeholder="Nome de quem vai usar" value={hd.name} onChange={(e) => upd({ name: e.target.value, me: false })} aria-label={`Nome do titular do ingresso ${h.n}`} />
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

            {step === "pagamento" && (
              <div className="pane">
                <h1 className="ck-h">Pagamento</h1>
                <p className="ck-p">Escolha como prefere pagar. Os ingressos chegam no seu e-mail assim que o pagamento é aprovado.</p>
                <div className="pm" role="radiogroup" aria-label="Forma de pagamento">
                  <button className={pay === "pix" ? "pmo on" : "pmo"} type="button" role="radio" aria-checked={pay === "pix"} onClick={() => { setPay("pix"); setTried(false); }}>
                    <span className="pm-r" aria-hidden="true" />
                    <span className="pm-ic" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2.8l4.2 4.2-4.2 4.2L7.8 7z" /><path d="M12 12.8l4.2 4.2-4.2 4.2-4.2-4.2z" /><path d="M2.8 12l4.2-4.2 4.2 4.2-4.2 4.2z" /><path d="M12.8 12l4.2-4.2 4.2 4.2-4.2 4.2z" /></svg>
                    </span>
                    <span className="pm-i"><b className="pm-t">Pix</b><span className="pm-s">Aprovação na hora</span></span>
                    <span className="pm-tag">Recomendado</span>
                  </button>
                  <button className={pay === "card" ? "pmo on" : "pmo"} type="button" role="radio" aria-checked={pay === "card"} onClick={() => { setPay("card"); setTried(false); }}>
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
                    <div className="cc" aria-hidden="true">
                      <span className="cc-logo">
                        <BrandMark size={22} />
                        <span className="cc-brand">{cardBrand(cc.num)}</span>
                      </span>
                      <span className="cc-num">{(fmtCard(cc.num) + " •••• •••• •••• ••••").slice(0, 19)}</span>
                      <span className="cc-row">
                        <span className="cc-nm">{cc.name.trim() || "Nome no cartão"}</span>
                        <span className="cc-ex">{fmtExp(cc.exp) || "MM/AA"}</span>
                      </span>
                    </div>
                    <div className="fg2">
                      <label className="lf2 span2">
                        <span className="lf2-l">Número do cartão</span>
                        <input className={bad(ccOk.num)} type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" value={cc.num} onChange={(e) => setCc((o) => ({ ...o, num: fmtCard(e.target.value) }))} autoComplete="cc-number" />
                      </label>
                      <label className="lf2 span2">
                        <span className="lf2-l">Nome impresso no cartão</span>
                        <input className={bad(ccOk.name)} type="text" placeholder="Como aparece no cartão" value={cc.name} onChange={(e) => setCc((o) => ({ ...o, name: e.target.value }))} autoComplete="cc-name" />
                      </label>
                      <label className="lf2">
                        <span className="lf2-l">Validade</span>
                        <input className={bad(ccOk.exp)} type="text" inputMode="numeric" placeholder="MM/AA" value={cc.exp} onChange={(e) => setCc((o) => ({ ...o, exp: fmtExp(e.target.value) }))} autoComplete="cc-exp" />
                      </label>
                      <label className="lf2">
                        <span className="lf2-l">CVV</span>
                        <input className={bad(ccOk.cvv)} type="text" inputMode="numeric" placeholder="123" value={cc.cvv} onChange={(e) => setCc((o) => ({ ...o, cvv: onlyDigits(e.target.value).slice(0, 4) }))} autoComplete="cc-csc" />
                      </label>
                    </div>
                    {tried && !cardValid && <p className="err">Confira os dados do cartão destacados.</p>}
                    <h2 className="ck-h3">Parcelas</h2>
                    <div className="inst">
                      {installments.map((o) => (
                        <button key={o.n} className={o.n === inst ? "ino on" : "ino"} type="button" onClick={() => setInst(o.n)}>
                          <b className="in-n">{o.n}x</b>
                          <span className="in-v">{money(o.eachCents)}</span>
                          <span className="in-s">{o.interestFree ? "sem juros" : `total ${money(o.totalCents)}`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="ck-test">Ambiente de teste: nenhuma cobrança real é feita e os dados do cartão não saem do seu navegador.</p>
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
                    <span className="pix-exp">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      Código expira em <b className="tm-v">{mmss(pixLeft)}</b>
                    </span>
                    <div className="cc2">
                      <span className="cc2-v">{order.pixCode}</span>
                      <button className="cc2-b" type="button" onClick={() => { void navigator.clipboard?.writeText(order.pixCode).catch(() => {}); setCopied(true); flash("Código Pix copiado"); }}>{copied ? "Copiado" : "Copiar código"}</button>
                    </div>
                    <ol className="howto">
                      <li>Abra o app do seu banco</li>
                      <li>Escolha Pix › Ler QR code ou Copia e cola</li>
                      <li>Confira o valor e o recebedor Tickets Win e confirme</li>
                    </ol>
                    <span className="pix-wait"><span className="pw-dot" aria-hidden="true" />Aguardando pagamento</span>
                    <button className="go2" type="button" onClick={() => void finish(order.orderId)} disabled={busy || expired}>Já fiz o pagamento</button>
                    <span className="ck-test">Ambiente de teste: o pagamento é confirmado ao clicar.</span>
                  </div>
                </div>
              </div>
            )}

            {step === "proc" && (
              <div className="pane proc">
                <div className="ld-tk proc-tk" aria-hidden="true">
                  <div className="ld-main">
                    <span className="ld-k">Tickets Win · Pagamento</span>
                    <b className="ld-t">{event.title}</b>
                    <span className="ld-d">{totalLabel} · {payLabel}</span>
                    <span className="ld-bar"><i /></span>
                  </div>
                  <div className="ld-stub"><span className="ld-code" /></div>
                </div>
                <h1 className="ck-h">Processando pagamento</h1>
                <p className="ck-p">Isso leva só alguns segundos. Não feche esta página.</p>
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
                    <span className="sm-lv">{money(l.quantity * l.priceCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="sm-rows">
                <Row k="Subtotal" v={money(price.subtotal)} />
                {price.meia > 0 && <Row k="Meia-entrada" v={`− ${money(price.meia)}`} ok />}
                {price.discount > 0 && <Row k={`Cupom ${coupon?.code ?? ""}`} v={`− ${money(price.discount)}`} ok />}
                <Row k="Taxa de serviço" v={event.feeRate ? money(price.fee) : "Inclusa no preço"} />
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
                <button className="go2 block" type="button" onClick={() => void next()} disabled={busy || expired}>
                  {busy ? "Aguarde…" : ctaLabel}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
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
          <span className="done-ok" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h1 className="done-h">Pedido confirmado!</h1>
          <p className="done-p">Enviamos os ingressos para <b className="done-b">{done.email || "seu e-mail"}</b>. Eles também já estão em Meus ingressos.</p>
          <div className="ld-tk done-tk">
            <div className="ld-main">
              <span className="ld-k">Tickets Win · Ingresso · Pedido #{done.number}</span>
              <b className="ld-t">{event.title}</b>
              <span className="ld-d">{event.dateNice} · {event.venue}</span>
              <span className="dn-q">{done.ticketCount} {done.ticketCount === 1 ? "ingresso" : "ingressos"}</span>
            </div>
            <div className="ld-stub done-stub">
              <span className="qr dn-qr qr-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: done.ticketQrSvg }} />
            </div>
          </div>
          <div className="done-a">
            <Link className="go2" href={`/meus-ingressos?pedido=${done.number}`}>Ver meus ingressos</Link>
            <a className="sec2" href={`/api/ingressos/${done.firstCode}/ics`} onClick={() => flash("Evento adicionado à sua agenda")}>Adicionar à agenda</a>
            <Link className="lk2" href="/">Voltar para o início</Link>
          </div>
          <div className="done-sum">
            <div className="ds"><span className="ds-k">Pagamento</span><b className="ds-v">{payLabel}</b></div>
            <div className="ds"><span className="ds-k">Total pago</span><b className="ds-v">{money(done.totalCents)}</b></div>
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
      <span className="tr-p">{money(t.priceCents)}</span>
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
