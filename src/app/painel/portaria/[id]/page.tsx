import type { Metadata } from "next";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Portaria } from "@/components/painel/portaria";
import { db, schema } from "@/db";
import { painelAccess } from "@/lib/painel/access";
import { whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in" };

export default async function PortariaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { events } = await painelAccess("portaria");
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  const t = schema.tickets;
  const [c] = await db.select({
    total: sql<number>`count(*)`,
    inside: sql<number>`count(*) filter (where ${t.checkedInAt} is not null)`,
  }).from(t).where(and(eq(t.eventId, e.id), inArray(t.status, ["valid", "used"])));
  return <Portaria eventId={e.id} title={e.title} sub={`${whenLabel(e)} · ${whereLabel(e)}`} total={Number(c?.total ?? 0)} inside={Number(c?.inside ?? 0)} />;
}
