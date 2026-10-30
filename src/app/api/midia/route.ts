import { randomBytes } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { sniffImage } from "@/lib/image-sniff";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** envios por conta a cada hora (um evento completo usa uns 10; freia o uso do bucket como depósito) */
const PER_HOUR = 60;

/** Recebe uma imagem do produtor (cartaz, banner, rascunho do mapa...) e guarda no R2. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para enviar imagens." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Envie JPG, PNG ou WebP." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "A imagem passa de 10 MB." }, { status: 413 });
  const bytes = await file.arrayBuffer();
  // o conteúdo tem de ser a imagem que o tipo diz (não um HTML ou outro arquivo com nome de imagem)
  if (sniffImage(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength))) !== file.type) return NextResponse.json({ error: "Envie JPG, PNG ou WebP." }, { status: 415 });

  const { env } = await getCloudflareContext({ async: true });
  const rateKey = `upload:${user.id}:${new Date().toISOString().slice(0, 13)}`;
  const used = Number((await env.KV.get(rateKey).catch(() => null)) ?? 0);
  if (used >= PER_HOUR) return NextResponse.json({ error: "Muitas imagens enviadas em pouco tempo. Tente de novo em uma hora." }, { status: 429 });
  await env.KV.put(rateKey, String(used + 1), { expirationTtl: 2 * 3600 }).catch(() => null);

  const key = `eventos/${user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  return NextResponse.json({ url: `/midia/${key}` });
}
