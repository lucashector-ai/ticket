import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProducerOnboarding } from "@/components/produtor/onboarding";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comece a vender", robots: { index: false } };

/** Cadastro do produtor: nome público e três perguntas rápidas, uma por tela. */
export default async function ProdutorCadastroPage() {
  const user = await getSessionUser();
  if (!user) redirect("/cadastro?next=/produtores/cadastro");
  const own = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, user.id), columns: { name: true, onboarding: true } });
  if (own?.onboarding?.doneAt) redirect("/painel");
  const first = (user.name || user.email?.split("@")[0] || "").trim().split(/\s+/)[0] ?? "";
  return <ProducerOnboarding firstName={first} fullName={user.name ?? ""} initialName={own?.name ?? ""} />;
}
