import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProducerOnboarding } from "@/components/produtor/onboarding";
import { getSessionUser } from "@/lib/auth/server";
import { MAX_ORGS_PER_ACCOUNT, orgAccessList } from "@/lib/data/org-access";
import { UFS } from "@/lib/producer-apply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova produtora", robots: { index: false } };

/** Nova produtora de quem já é produtor (até MAX_ORGS_PER_ACCOUNT por conta): o mesmo formulário do cadastro. */
export default async function NovaProdutoraPage() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/produtores/nova");
  const owned = (await orgAccessList(user.id)).filter((x) => x.role === "owner").length;
  // ainda sem produtora: o caminho é a inscrição. No limite, o formulário avisa (sem redirecionar: depois de criar a
  // terceira, a página é recarregada pela ação e precisa continuar mostrando o "Pronto")
  if (!owned) redirect("/criar-evento");
  const first = (user.name || user.email?.split("@")[0] || "").trim().split(/\s+/)[0] ?? "";
  return (
    <ProducerOnboarding firstName={first} ufs={UFS} initial={{ name: "", city: "", uf: "", instagram: "", tagline: "" }}
      nova={{ owned, max: MAX_ORGS_PER_ACCOUNT }} />
  );
}
