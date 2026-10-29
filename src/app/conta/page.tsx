import type { Metadata } from "next";
import { ContaDados } from "@/components/conta/dados";
import { ContaShell } from "@/components/conta/shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { contaUser } from "@/lib/data/conta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

export default async function ContaPage() {
  const { user, profile } = await contaUser("/conta");
  const name = profile?.name || user.name || "";
  const avatar = profile?.avatarUrl ?? user.image ?? null;
  return (
    <div className="pg-conta">
      <SiteHeader user={user} variant="default" activePath="/conta" />
      <ContaShell name={name} email={user.email} avatar={avatar} mfa={!!profile?.mfaMethod}>
        <ContaDados initial={{
          name, email: user.email, phone: profile?.phone ?? "", cpf: profile?.cpf ?? "", birthDate: profile?.birthDate ?? "",
          avatar, address: profile?.address ?? null, verified: !!user.emailVerified,
        }} />
      </ContaShell>
      <SiteFooter />
    </div>
  );
}
