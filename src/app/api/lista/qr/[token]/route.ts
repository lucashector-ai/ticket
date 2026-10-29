import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import { guestQrPayload } from "@/lib/guest-list";

/**
 * QR do ingresso de lista em PNG (/api/lista/qr/<token>.png), para o e-mail (que não mostra SVG).
 * Só responde enquanto o nome está na lista: removido, dá 404. O conteúdo é o mesmo "LISTA|<token>" dos leitores.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.png$/, "");
  const notFound = () => new Response("Não encontrado", { status: 404, headers: { "cache-control": "no-store" } });
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return notFound();
  const g = await db.query.guestListEntries.findFirst({ where: eq(schema.guestListEntries.token, token), columns: { token: true } });
  if (!g) return notFound();
  const png = await QRCode.toBuffer(guestQrPayload(g.token), { type: "png", margin: 1, width: 400, errorCorrectionLevel: "M", color: { dark: "#111111ff", light: "#ffffffff" } });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
