import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PainelShell } from "@/components/painel/shell";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope } from "@/lib/data/painel";
import { initials } from "@/lib/format";

export const metadata: Metadata = { title: { default: "Painel do produtor", template: "%s · Painel · Tickets Win" }, robots: { index: false } };

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/painel");
  const { org } = await getPainelScope(user.id);
  const name = org?.name ?? user.name ?? "Produtor";
  return (
    <div className="pg-painel">
      <PainelShell orgName={name} orgInitials={org?.initials ?? initials(name)} orgSlug={org?.slug ?? null} userName={user.name || user.email}>{children}</PainelShell>
    </div>
  );
}
