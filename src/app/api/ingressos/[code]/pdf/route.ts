import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { qrPayload } from "@/lib/tickets/qr";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { mediaJpeg } from "@/lib/media-jpeg";
import { ticketCard } from "@/lib/tickets/card";
import { forSession } from "@/lib/tickets/labels";
import { ticketPdf } from "@/lib/tickets/pdf";

/** PDF do ingresso, gerado no servidor e entregue como download (vai direto para os arquivos). Só o titular baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`, req.url));
  const t = await getTicketByCode(code);
  if (!t || t.holderUserId !== user.id) return NextResponse.json({ error: "Ingresso não encontrado." }, { status: 404 });

  const card = ticketCard(t, forSession(t.event, t.ticketType.session));
  const payload = await qrPayload(t.code, t.secret);
  // PDF pronto fica guardado no R2 (muda a chave se qualquer dado do ingresso, o QR ou a arte mudar)
  const { env } = await getCloudflareContext({ async: true });
  const key = `pdf/${t.code}-${createHash("sha256").update(JSON.stringify([card, payload, t.event.flyerId, 2])).digest("hex").slice(0, 20)}.pdf`;
  const saved = await env.MEDIA.get(key).catch(() => null);
  let pdf: Uint8Array;
  if (saved) pdf = new Uint8Array(await saved.arrayBuffer());
  else {
    const art = await mediaJpeg(t.event.flyerId, { width: 800, height: 1000, fit: "cover" }).catch(() => null);
    pdf = await ticketPdf(card, payload, art);
    await env.MEDIA.put(key, pdf, { httpMetadata: { contentType: "application/pdf" } }).catch(() => null);
  }
  return new NextResponse(new Blob([pdf as BlobPart], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      // attachment: clicou, baixou (Android vai para Downloads; iPhone salva em Arquivos › Downloads)
      "content-disposition": `attachment; filename="ingresso-${t.code}.pdf"`,
      "content-length": String(pdf.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
