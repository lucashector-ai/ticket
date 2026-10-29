import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getEventBySlug } from "@/lib/data/events";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CompraFlow, type CompraEvent, type CompraSession, type CompraStep } from "@/components/compra/compra-flow";
import { dateNice, hourLabel, parts } from "@/lib/format";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { turnstileSiteKey } from "@/lib/turnstile";
import { tierStatus } from "@/lib/tickets/status";
import { canBuy } from "@/lib/launch";
import { queueAllows } from "@/lib/queue";
import { heldByType } from "@/lib/holds";
import { lookupSpecial } from "@/lib/special";
import { stripeEnabled, stripePublishableKey } from "@/lib/payments/stripe";
import { pendingOrderFor, resumeView, type ResumeData } from "@/lib/payments/pending";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /checkout?evento=<slug>&itens=<ticketTypeId>:<qtd>,...&cupom=<código>&etapa=dados
 * Parte de um grupo: &grupo=<código>&vaga=<id> · Revenda: &revenda=<id do anúncio> (1 ingresso, preço travado)
 * Retomar um pedido não pago: /checkout?pedido=<id> (Meus ingressos, recarregar no meio do pagamento). Quem volta
 * ao checkout do evento com um pedido pendente desse evento também cai nele, na etapa de pagamento.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const pedido = one("pedido");
  const user = await getSessionUser();

  // retomada pelo número do pedido: só o dono, só enquanto está pendente e dentro da reserva
  let order: typeof schema.orders.$inferSelect | null = null;
  let notice: string | null = null;
  let slug = one("evento");
  if (pedido) {
    if (!user) redirect(`/entrar?next=${encodeURIComponent(`/checkout?pedido=${pedido}`)}`);
    if (!UUID.test(pedido)) redirect("/meus-ingressos");
    const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, pedido), eq(schema.orders.userId, user.id)), with: { event: { columns: { slug: true } }, items: { columns: { ticketTypeId: true, quantity: true } } } });
    if (!o) redirect("/meus-ingressos");
    if (o.status === "paid") redirect(`/meus-ingressos?pedido=${o.number}`);
    slug = o.event.slug;
    if (o.status === "pending" && o.expiresAt && o.expiresAt > new Date()) order = o;
    else {
      // venceu ou foi cancelado: volta para a escolha com os mesmos ingressos
      const itens = o.items.map((i) => `${i.ticketTypeId}:${i.quantity}`).join(",");
      const q = o.groupShareId || o.resaleListingId ? "" : `&itens=${encodeURIComponent(itens)}`;
      redirect(`/checkout?evento=${encodeURIComponent(slug)}${q}&aviso=${o.status === "cancelled" ? "cancelado" : "expirado"}`);
    }
  }
  if (!slug) redirect("/explorar");
  if (one("aviso") === "expirado") notice = "A reserva do seu pedido acabou e ele não foi pago. Os ingressos voltaram para a venda: confira e continue para garantir de novo.";
  if (one("aviso") === "cancelado") notice = "Aquele pedido foi cancelado e nada foi cobrado. Confira os ingressos e continue para fazer um novo.";
  const e = await getEventBySlug(slug);
  if (!e || e.status !== "published") redirect("/explorar");

  const ref = order
    ? { groupShareId: order.groupShareId, resaleListingId: order.resaleListingId }
    : { groupShareId: one("vaga") || null, resaleListingId: one("revenda") || null };
  const found = ref.groupShareId || ref.resaleListingId ? await lookupSpecial(e.id, ref, user?.id ?? null) : null;
  if (found && !found.ok) redirect(ref.groupShareId && one("grupo") ? `/grupo/${encodeURIComponent(one("grupo"))}?erro=${encodeURIComponent(found.error)}` : order ? "/meus-ingressos" : `/eventos/${e.slug}?revenda=indisponivel`);
  const special = found?.ok ? found.s : null;
  // voltou ao checkout do evento com um pedido deste evento ainda não pago: continua nele
  if (!order && user) order = await pendingOrderFor(user.id, e.id, ref);
  const resume: ResumeData | null = order ? await resumeView(order) : null;
  // pedido já criado passou pela abertura das vendas e pela fila
  if (!special && !resume && (!(await canBuy(e)).ok || !(await queueAllows(e)))) redirect(`/eventos/${e.slug}`);
  const held = special ? new Map<string, number>() : await heldByType(e.id);
  const resumed = new Map((resume?.items ?? []).map((i) => [i.ticketTypeId, i]));

  const qty: Record<string, number> = {};
  if (resume) for (const it of resume.items) qty[it.ticketTypeId] = it.quantity;
  else if (special) qty[special.ticketTypeId] = 1;
  else for (const part of one("itens").split(",")) {
    const [id, q] = part.split(":");
    const n = Number.parseInt(q ?? "", 10);
    const tt = e.ticketTypes.find((t) => t.id === id && tierStatus(t) === "open");
    if (tt && Number.isFinite(n) && n > 0) qty[tt.id] = Math.min(n, tt.maxPerOrder, e.maxPerOrder);
  }
  const profile = user ? await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, user.id) }) : null;

  // várias datas: mesmas pílulas da página do evento (ordem cronológica)
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], MS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const sessions: CompraSession[] = e.sessions.length > 1
    ? [...e.sessions].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((s) => {
      const p = parts(s.startAt);
      const city = e.format === "turne" && s.venue ? s.venue.city.name : null;
      return { id: s.id, wd: WD[p.wd], day: `${p.d} ${MS[p.m - 1]}`, sub: city ?? hourLabel(s.startAt), label: [dateNice(s.startAt), city].filter(Boolean).join(" · ") };
    })
    : [];

  const event: CompraEvent = {
    slug: e.slug,
    title: e.title,
    flyerId: e.flyerId,
    dateNice: e.dateLabel ?? "",
    venue: e.venueNameOverride ?? e.venue?.name ?? "",
    city: e.venue?.city.name ?? "",
    maxPerOrder: e.maxPerOrder,
    tiers: e.ticketTypes.filter((t) => !special || t.id === special.ticketTypeId).map((t) => {
      const left = t.quantity - t.sold - (held.get(t.id) ?? 0);
      // pedido retomado: os ingressos dele continuam valendo pelo preço do pedido
      const r = resumed.get(t.id);
      return {
        id: t.id, name: t.sector ? `${t.sector} · ${t.name}` : t.name, type: t.name, note: t.note ?? "", desc: t.description,
        priceCents: r ? r.unitPriceCents : special ? special.priceCents : t.priceCents,
        open: special || r ? true : tierStatus(t) === "open" && left > 0, sold: special || r ? false : t.status === "sold_out" || left <= 0,
        sector: t.sector, sectorColor: t.sectorColor, sessionId: special ? null : t.sessionId, meiaOk: special ? false : (!t.kind || t.kind === "inteira") && t.priceCents > 0,
        limit: special ? 1 : Math.max(r?.quantity ?? 0, Math.min(t.maxPerOrder, e.maxPerOrder)),
      };
    }),
    sessions: special ? [] : sessions,
    feeRate: e.absorbFee ? 0 : SERVICE_FEE_RATE,
  };
  const step = (["resumo", "dados"].includes(one("etapa")) ? one("etapa") : "resumo") as CompraStep;
  // pagamento de verdade: a chave publicável vai como prop (lida em runtime, sem NEXT_PUBLIC_)
  const stripeKey = stripePublishableKey();
  if (stripeEnabled() && !stripeKey) console.error("checkout: STRIPE_SECRET_KEY sem STRIPE_PUBLISHABLE_KEY: o cartão não vai funcionar");
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-compra">
      <SiteHeader user={headerUser} variant="default" />
      <CompraFlow
        event={event}
        user={user ? { id: user.id, name: user.name ?? "", email: user.email ?? "" } : null}
        profile={profile ? { name: profile.name ?? "", phone: profile.phone ?? "", cpf: profile.cpf ?? "" } : null}
        initialQty={qty}
        initialCoupon={resume ? null : one("cupom").toUpperCase() || null}
        initialStep={Object.keys(qty).length ? step : "resumo"}
        resume={resume}
        notice={notice}
        queueEventId={!special && e.queueMode !== "off" ? e.id : null}
        human={turnstileSiteKey()}
        stripeKey={stripeKey}
        lock={special ? (special.kind === "grupo"
          ? { kind: "grupo", ref: { groupShareId: special.shareId }, query: `grupo=${encodeURIComponent(special.groupCode)}&vaga=${special.shareId}`, title: `Sua parte do grupo · vaga ${special.slot} de ${special.slots}`, note: "O preço é o do lote reservado pelo grupo. Cupom e meia-entrada não valem nas partes do grupo.", back: `/grupo/${special.groupCode}` }
          : { kind: "revenda", ref: { resaleListingId: special.listingId }, query: `revenda=${special.listingId}`, title: "Ingresso da revenda oficial", note: "Comprado de outro fã. Ao pagar, você recebe um QR code novo e o antigo deixa de valer.", back: `/eventos/${e.slug}#revenda` }) : null}
      />
      <SiteFooter />
    </div>
  );
}
