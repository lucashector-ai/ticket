import { redirect } from "next/navigation";
import { BancoHome } from "@/components/banco/home";
import { bankBase, bankUserId, destLabel, hasDestination, MIN_PAYOUT, RELEASE_DAYS, walletFor } from "@/lib/bank";
import { userContact } from "@/lib/notify";

export const dynamic = "force-dynamic";

export default async function BancoPage() {
  const base = await bankBase();
  const userId = await bankUserId();
  if (!userId) redirect(`${base}/entrar`);
  const [w, me] = await Promise.all([walletFor(userId), userContact(userId)]);
  const site = base ? "" : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br");
  return (
    <BancoHome
      base={base}
      name={w?.org?.name || me?.name || "Produtor"}
      email={me?.email ?? ""}
      configUrl={`${site}/painel/configuracoes`}
      wallet={w ? {
        available: w.available, pending: w.pending, paidOut: w.paidOut, inFlight: w.inFlight, nextRelease: w.nextRelease,
        testSales: w.testSales, entries: w.entries, destination: hasDestination(w.destination) ? destLabel(w.destination) : null,
      } : null}
      rules={{ min: MIN_PAYOUT, releaseDays: RELEASE_DAYS }}
    />
  );
}
