import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { appleWalletEnabled, buildPkpass } from "@/lib/wallet/apple";
import { passData } from "@/lib/wallet/pass-data";

/** Passe da Apple Wallet do ingresso. Só o titular baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const back = (flag: string) => NextResponse.redirect(new URL(`/ingressos/${encodeURIComponent(code)}?wallet=${flag}`, site));
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`, site));
  const t = await getTicketByCode(code);
  if (!t || t.holderUserId !== user.id) return NextResponse.json({ error: "Ingresso não encontrado." }, { status: 404 });
  if (!appleWalletEnabled()) return back("apple-indisponivel");
  try {
    const pkpass = await buildPkpass(await passData(t, site));
    return new NextResponse(pkpass as unknown as BodyInit, {
      headers: {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": `attachment; filename="ticketswin-${t.code}.pkpass"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("apple wallet", e);
    return back("apple-erro");
  }
}
