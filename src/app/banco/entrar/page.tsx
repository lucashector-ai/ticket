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
  return <BancoLogin base={base} human={turnstileSiteKey()} pending={!!(await bankPendingUserId())} />;
}
