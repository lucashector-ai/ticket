import type { Metadata } from "next";
import { ContaPagamentos } from "@/components/conta/pagamentos";
import { ContaShell } from "@/components/conta/shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { contaUser } from "@/lib/data/conta";
import { listCustomerCards, type SavedCard } from "@/lib/payments/cards";
import { stripeEnabled } from "@/lib/payments/stripe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pagamentos", robots: { index: false } };

export default async function PagamentosPage() {
  const { user, profile } = await contaUser("/conta/pagamentos");
  const enabled = stripeEnabled();
  let cards: SavedCard[] = [];
  let failed = false;
  // só a conta logada: o cliente vem do perfil dela
  if (enabled && profile?.stripeCustomerId) {
    try {
      cards = (await listCustomerCards(profile.stripeCustomerId)).cards;
    } catch (e) {
      console.error("conta/pagamentos", (e as Error).message);
      failed = true;
    }
  }
  return (
    <div className="pg-conta">
      <SiteHeader user={user} variant="default" activePath="/conta" />
      <ContaShell name={profile?.name || user.name || ""} email={user.email} avatar={profile?.avatarUrl ?? user.image ?? null} mfa={!!profile?.mfaMethod}>
        <ContaPagamentos cards={cards} failed={failed} enabled={enabled} />
      </ContaShell>
      <SiteFooter />
    </div>
  );
}
