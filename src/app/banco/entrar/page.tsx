import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BancoLogin } from "@/components/banco/login";
import { bankBase, bankPendingUserId, bankUserId } from "@/lib/bank";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default async function BancoEntrar() {
  const base = await bankBase();
  if (await bankUserId()) redirect(base || "/");
  const site = base ? "" : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br");
  return <BancoLogin base={base} human={turnstileSiteKey()} painel={`${site}/painel/financeiro`} pending={!!(await bankPendingUserId())} />;
}
