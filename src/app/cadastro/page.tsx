import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { getAuthState } from "@/lib/auth/server";
import { turnstileSiteKey } from "@/lib/turnstile";
import { appleSignInEnabled } from "@/lib/auth/apple";
import { safeNextParam } from "@/lib/auth/next-param";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar conta" };

type Props = { searchParams: Promise<{ next?: string | string[]; email?: string | string[] }> };

export default async function CadastroPage({ searchParams }: Props) {
  const { next: rawNext, email: rawEmail } = await searchParams;
  const email = typeof rawEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.slice(0, 254) : "";
  const next = safeNextParam(rawNext);
  const { user, pending } = await getAuthState();
  if (pending) redirect(`/verificacao?next=${encodeURIComponent(next)}`);
  if (user) redirect(next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" activePath="/entrar" />
      <AuthCard>
        <SignupForm next={next} human={turnstileSiteKey()} apple={appleSignInEnabled()} initialEmail={email} />
      </AuthCard>
    </div>
  );
}
