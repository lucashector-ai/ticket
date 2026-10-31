import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ProducerOnboarding } from "@/components/produtor/onboarding";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { activateHref, emailConfirmed } from "@/lib/auth/verified";
import { canOnboard, producerStatus, UFS } from "@/lib/producer-apply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Monte sua página de produtor", robots: { index: false } };

/** Cadastro do produtor: abre depois que a inscrição é aprovada (link no e-mail de aprovação). */
export default async function ProdutorCadastroPage() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/produtores/cadastro");
  const own = await db.query.organizers.findFirst({ where: eq(schema.organizers.ownerUserId, user.id), columns: { name: true, onboarding: true, cityName: true, uf: true, instagram: true, tagline: true } });
  if (own?.onboarding?.doneAt) redirect("/painel");
  const { status, app } = await producerStatus(user);
  if (!canOnboard(status)) redirect("/criar-evento");
  if (status === "approved" && !(await emailConfirmed(user))) redirect(activateHref("/produtores/cadastro"));
  const first = (app?.firstName || user.name || user.email?.split("@")[0] || "").trim().split(/\s+/)[0] ?? "";
  return (
    <ProducerOnboarding
      firstName={first}
      ufs={UFS}
      initial={{
        name: own?.name || app?.company || "", city: own?.cityName || app?.city || "", uf: own?.uf || app?.uf || "",
        instagram: (own?.instagram || app?.instagram || "").replace(/^@/, ""), tagline: own?.tagline || "",
      }}
    />
  );
}
