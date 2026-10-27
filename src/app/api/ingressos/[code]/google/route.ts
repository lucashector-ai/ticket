import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { googleSaveUrl, googleWalletEnabled } from "@/lib/wallet/google";
import { passData } from "@/lib/wallet/pass-data";

/** Leva ao "Salvar no Google Wallet" do ingresso. Só o titular. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const back = (flag: string) => NextResponse.redirect(new URL(`/ingressos/${encodeURIComponent(code)}?wallet=${flag}`, site));
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`, site));
  const t = await getTicketByCode(code);
  if (!t || t.holderUserId !== user.id) return NextResponse.json({ error: "Ingresso não encontrado." }, { status: 404 });
  if (!googleWalletEnabled()) return back("google-indisponivel");
  try {
    return NextResponse.redirect(await googleSaveUrl(await passData(t, site), site));
  } catch (e) {
    console.error("google wallet", e);
    return back("google-erro");
  }
}
