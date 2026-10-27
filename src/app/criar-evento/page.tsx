import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CriarFlow } from "@/components/criar/criar-flow";
import { emptyDraft, type DbMap, type Draft } from "@/lib/criar/model";

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
    const ev = await db.query.events.findFirst({ where: eq(schema.events.id, editId), columns: { id: true, slug: true, createdByUserId: true, draft: true } });
    if (!ev || ev.createdByUserId !== user.id) notFound();
    const saved = ev.draft as { form?: Draft; dbMap?: DbMap } | null;
    initial = { ...emptyDraft(), ...(saved?.form ?? {}) };
    dbMap = saved?.dbMap ?? null;
    slug = ev.slug;
  }
  const headerUser = { id: user.id, name: user.name, email: user.email, image: user.image };

  return (
    <div className="pg-criar">
      <SiteHeader user={headerUser} variant="default" />
      <CriarFlow key={editId ?? "novo"} initial={initial} eventId={editId} slug={slug} dbMap={dbMap} />
      <SiteFooter />
    </div>
  );
}
