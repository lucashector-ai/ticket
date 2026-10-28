import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { CriarFlow } from "@/components/criar/flow";
import { brDateTime, emptyDraft, STEP_LABELS, type DbMap, type Draft } from "@/lib/criar/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar evento" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** /criar-evento (novo) ou /criar-evento?editar=<id> (evento já salvo por este usuário). */
export default async function CriarEventoPage({ searchParams }: { searchParams: Search }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/criar-evento");
  const sp = await searchParams;
  const editId = typeof sp.editar === "string" ? sp.editar : null;

  let initial: Draft | null = null, dbMap: DbMap | null = null, slug: string | null = null;
  if (editId) {
    if (!/^[0-9a-f-]{36}$/.test(editId)) notFound();
    const ev = await db.query.events.findFirst({ where: eq(schema.events.id, editId), columns: { id: true, slug: true, createdByUserId: true, draft: true, transferEnabled: true, resaleEnabled: true, salesOpenAt: true, presaleAt: true, launchPage: true } });
    if (!ev || ev.createdByUserId !== user.id) notFound();
    const saved = ev.draft as { form?: Draft; dbMap?: DbMap } | null;
    // transferência, revenda, abertura e pré-venda também mudam pelo painel: vale o que está no evento
    const base = emptyDraft();
    initial = {
      ...base, ...(saved?.form ?? {}), transfer: ev.transferEnabled, resale: ev.resaleEnabled,
      saleStart: ev.salesOpenAt ? brDateTime(ev.salesOpenAt) : "", presaleStart: ev.presaleAt ? brDateTime(ev.presaleAt) : "",
      teaser: { ...base.teaser, ...(saved?.form?.teaser ?? {}), ...(ev.launchPage ?? {}) },
    };
    dbMap = saved?.dbMap ?? null;
    slug = ev.slug;
  }
  // evento novo: começa com os padrões das Configurações do painel
  let defaults: Partial<Draft> = {};
  if (!editId) {
    const org = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, user.id), columns: { defaults: true } });
    const d = org?.defaults;
    if (d) defaults = { fee: d.buyerPaysFee ?? true, autoMeia: d.autoMeia ?? true, ...(d.age ? { age: d.age } : {}), ...(d.refund ? { refund: d.refund } : {}) };
  }
  // ?etapa=vendas abre direto numa etapa (atalho do painel)
  const etapa = typeof sp.etapa === "string" ? STEP_LABELS.findIndex((l) => l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === sp.etapa) : -1;

  return (
    <div className="pg-criar">
      <CriarFlow key={editId ?? "novo"} initial={initial} defaults={defaults} eventId={editId} slug={slug} dbMap={dbMap} startStep={etapa >= 0 ? etapa : editId ? STEP_LABELS.length : 0} />
    </div>
  );
}
