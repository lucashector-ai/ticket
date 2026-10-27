import type { Metadata } from "next";
import { PainelConfig } from "@/components/painel/config";
import { AGES, DEFAULT_REFUND } from "@/lib/criar/model";
import { painelAccess } from "@/lib/painel/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

export default async function PainelConfigPage() {
  const { user, org } = await painelAccess("owner");
  const name = org?.name ?? user.name ?? "";
  return (
    <PainelConfig
      initial={{
        name, slug: org?.slug ?? "", contactEmail: org?.contactEmail ?? user.email ?? "",
        legalName: org?.legalName ?? "", cnpj: org?.cnpj ?? "",
        payout: { bank: "", agency: "", account: "", kind: "corrente", holder: "", doc: "", pixKey: "", ...org?.payout },
        defaults: {
          buyerPaysFee: org?.defaults?.buyerPaysFee ?? true, autoMeia: org?.defaults?.autoMeia ?? true,
          age: AGES.find((a) => a === org?.defaults?.age) ?? "18+", refund: org?.defaults?.refund ?? DEFAULT_REFUND,
        },
      }}
      hasOrg={!!org}
    />
  );
}
