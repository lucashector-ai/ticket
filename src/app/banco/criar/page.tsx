import type { Metadata } from "next";
import { BancoSetup } from "@/components/banco/setup";
import { bankBase } from "@/lib/bank";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar ou recuperar acesso" };

export default async function BancoCriar() {
  const base = await bankBase();
  const site = base ? "" : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br");
  return <BancoSetup base={base} human={turnstileSiteKey()} contaUrl={`${site}/conta/seguranca`} />;
}
