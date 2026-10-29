import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * /checkout?evento=<slug>&itens=<ticketTypeId>:<qtd>,...&cupom=<código>&etapa=dados
 * Parte de um grupo: &grupo=<código>&vaga=<id> · Revenda: &revenda=<id do anúncio> (1 ingresso, preço travado)
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const slug = one("evento");
  if (!slug) redirect("/explorar");
  const [e, user] = await Promise.all([getEventBySlug(slug), getSessionUser()]);
  if (!e || e.status !== "published") redirect("/explorar");

  const ref = { groupShareId: one("vaga") || null, resaleListingId: one("revenda") || null };
  const found = ref.groupShareId || ref.resaleListingId ? await lookupSpecial(e.id, ref, user?.id ?? null) : null;
  if (found && !found.ok) redirect(ref.groupShareId && one("grupo") ? `/grupo/${encodeURIComponent(one("grupo"))}?erro=${encodeURIComponent(found.error)}` : `/eventos/${e.slug}?revenda=indisponivel`);
  const special = found?.ok ? found.s : null;
  if (!special && (!(await canBuy(e)).ok || !(await queueAllows(e)))) redirect(`/eventos/${e.slug}`);
  const held = special ? new Map<string, number>() : await heldByType(e.id);

  const qty: Record<string, number> = {};
  if (special) qty[special.ticketTypeId] = 1;
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
      return {
        id: t.id, name: t.sector ? `${t.sector} · ${t.name}` : t.name, type: t.name, note: t.note ?? "", desc: t.description,
        priceCents: special ? special.priceCents : t.priceCents,
        open: special ? true : tierStatus(t) === "open" && left > 0, sold: special ? false : t.status === "sold_out" || left <= 0,
        sector: t.sector, sectorColor: t.sectorColor, sessionId: special ? null : t.sessionId, meiaOk: special ? false : (!t.kind || t.kind === "inteira") && t.priceCents > 0,
        limit: special ? 1 : Math.min(t.maxPerOrder, e.maxPerOrder),
      };
    }),
    sessions: special ? [] : sessions,
    feeRate: e.absorbFee ? 0 : SERVICE_FEE_RATE,
  };
  const step = (["resumo", "dados"].includes(one("etapa")) ? one("etapa") : "resumo") as CompraStep;
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-compra">
      <SiteHeader user={headerUser} variant="default" />
      <CompraFlow
        event={event}
        user={user ? { id: user.id, name: user.name ?? "", email: user.email ?? "" } : null}
        profile={profile ? { name: profile.name ?? "", phone: profile.phone ?? "", cpf: profile.cpf ?? "" } : null}
        initialQty={qty}
        initialCoupon={one("cupom").toUpperCase() || null}
        initialStep={Object.keys(qty).length ? step : "resumo"}
        queueEventId={!special && e.queueMode !== "off" ? e.id : null}
        human={turnstileSiteKey()}
        lock={special ? (special.kind === "grupo"
          ? { kind: "grupo", ref: { groupShareId: special.shareId }, query: `grupo=${encodeURIComponent(special.groupCode)}&vaga=${special.shareId}`, title: `Sua parte do grupo · vaga ${special.slot} de ${special.slots}`, note: "O preço é o do lote reservado pelo grupo. Cupom e meia-entrada não valem nas partes do grupo.", back: `/grupo/${special.groupCode}` }
          : { kind: "revenda", ref: { resaleListingId: special.listingId }, query: `revenda=${special.listingId}`, title: "Ingresso da revenda oficial", note: "Comprado de outro fã. Ao pagar, você recebe um QR code novo e o antigo deixa de valer.", back: `/eventos/${e.slug}#revenda` }) : null}
      />
      <SiteFooter />
    </div>
  );
}
