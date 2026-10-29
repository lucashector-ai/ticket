import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/verify-form";
import { getAuthState } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirme que é você", robots: { index: false } };

/**
 * Segunda etapa do login: código do app autenticador (ou de recuperação) ou do e-mail.
 * O login com senha e a volta do Google passam por aqui.
 */
export default async function VerificacaoPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = safeNextParam((await searchParams).next);
  // nunca volta para a própria /verificacao (evita laço)
  const next = raw.startsWith("/verificacao") ? "/" : raw;
  const { user, pending } = await getAuthState();
  // sem sessão (Google cancelado ou falhou) ou sem segunda etapa: segue para o destino;
  // se ele exigir login, o próprio destino manda para /entrar
  if (!user || !pending) redirect(next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" />
      <AuthCard>
        <VerifyForm next={next} />
      </AuthCard>
    </div>
  );
}
