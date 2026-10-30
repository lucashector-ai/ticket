import { NextResponse } from "next/server";
import { qrPayload } from "@/lib/actions/tickets";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { mediaJpeg } from "@/lib/media-jpeg";
import { ticketCard } from "@/lib/tickets/card";
import { ticketPdf } from "@/lib/tickets/pdf";

/** PDF do ingresso, gerado no servidor (abre e baixa em qualquer celular). Só o titular baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`, req.url));
  const t = await getTicketByCode(code);
  if (!t || t.holderUserId !== user.id) return NextResponse.json({ error: "Ingresso não encontrado." }, { status: 404 });

  const card = ticketCard(t, t.event);
  const [payload, art] = await Promise.all([
    qrPayload(t.code, t.secret),
    mediaJpeg(t.event.flyerId, { width: 800, height: 1000, fit: "cover" }).catch(() => null),
  ]);
  const pdf = await ticketPdf(card, payload, art);
  return new NextResponse(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      // inline: no celular abre o leitor de PDF (com "Salvar"/"Compartilhar"); o link tem download para o computador baixar
      "content-disposition": `inline; filename="ingresso-${t.code}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
