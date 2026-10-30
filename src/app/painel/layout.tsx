import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PainelShell } from "@/components/painel/shell";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope } from "@/lib/data/painel";
import { initials } from "@/lib/format";
import { hasDestination } from "@/lib/bank";

export const metadata: Metadata = { title: { default: "Painel do produtor", template: "%s · Painel · Tickets Win" }, robots: { index: false } };

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/painel");
  const { org, role } = await getPainelScope(user);
  const name = org?.name ?? user.name ?? "Produtor";
  // dono sem conta de recebimento completa (destino + titular + CPF/CNPJ): aviso em todo o painel
  const p = org?.payout ?? null;
  const payoutMissing = role === "owner" && !!org && !(hasDestination(p) && p?.holder?.trim() && p?.doc?.trim());
  return (
    <div className="pg-painel">
      <PainelShell role={role} orgName={name} orgInitials={org?.initials ?? initials(name)} orgSlug={org?.slug ?? null} userName={user.name || user.email} payoutMissing={payoutMissing}>{children}</PainelShell>
    </div>
  );
}
