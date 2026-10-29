import { redirect } from "next/navigation";

/** Links antigos de check-in abrem o app da portaria. */
export default async function CheckinLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/portaria/entrar/${encodeURIComponent(token)}`);
}
