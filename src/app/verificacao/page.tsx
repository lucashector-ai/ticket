import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/verify-form";
import { getAuthState } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";
import { whatsappEnabled } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirme que é você", robots: { index: false } };

/** Segunda etapa do login: código por e-mail ou WhatsApp. */
export default async function VerificacaoPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNextParam((await searchParams).next);
  const { user, pending } = await getAuthState();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  if (!pending) redirect(next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" />
      <AuthCard>
        <VerifyForm next={next} whatsapp={whatsappEnabled()} />
      </AuthCard>
    </div>
  );
}
