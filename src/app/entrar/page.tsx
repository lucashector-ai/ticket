import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthState } from "@/lib/auth/server";
import { turnstileSiteKey } from "@/lib/turnstile";
import { appleSignInEnabled } from "@/lib/auth/apple";
import { safeNextParam } from "@/lib/auth/next-param";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function EntrarPage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams;
  const next = safeNextParam(rawNext);
  const { user, pending } = await getAuthState();
  if (pending) redirect(`/verificacao?next=${encodeURIComponent(next)}`);
  if (user) redirect(next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" activePath="/entrar" />
      <AuthCard>
        <LoginForm next={next} human={turnstileSiteKey()} apple={appleSignInEnabled()} />
      </AuthCard>
    </div>
  );
}
