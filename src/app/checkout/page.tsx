import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getEventBySlug } from "@/lib/data/events";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CompraFlow, type CompraEvent, type CompraStep } from "@/components/compra/compra-flow";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { tierStatus } from "@/lib/tickets/status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar compra" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** /checkout?evento=<slug>&itens=<ticketTypeId>:<qtd>,...&cupom=<código>&etapa=dados */
export default async function CheckoutPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const slug = one("evento");
  if (!slug) redirect("/explorar");
  const [e, user] = await Promise.all([getEventBySlug(slug), getSessionUser()]);
  if (!e || e.status !== "published") redirect("/explorar");

  const qty: Record<string, number> = {};
  for (const part of one("itens").split(",")) {
    const [id, q] = part.split(":");
    const n = Number.parseInt(q ?? "", 10);
    if (id && Number.isFinite(n) && n > 0 && e.ticketTypes.some((t) => t.id === id && tierStatus(t) === "open")) qty[id] = Math.min(n, 8);
  }
  const profile = user ? await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, user.id) }) : null;

  const event: CompraEvent = {
    slug: e.slug,
    title: e.title,
    flyerId: e.flyerId,
    dateNice: e.dateLabel ?? "",
    venue: e.venueNameOverride ?? e.venue?.name ?? "",
    city: e.venue?.city.name ?? "",
    maxPerOrder: e.maxPerOrder,
    tiers: e.ticketTypes.map((t) => ({
      id: t.id, name: t.sector ? `${t.sector} · ${t.name}` : t.name, note: t.note ?? "", priceCents: t.priceCents,
      open: tierStatus(t) === "open" && t.sold < t.quantity, sold: t.status === "sold_out" || t.sold >= t.quantity,
      sector: t.sector, meiaOk: !t.kind || t.kind === "inteira",
    })),
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
      />
      <SiteFooter />
    </div>
  );
}
