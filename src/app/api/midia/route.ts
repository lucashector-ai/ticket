import { randomBytes } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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

  const key = `eventos/${user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  const { env } = await getCloudflareContext({ async: true });
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  return NextResponse.json({ url: `/midia/${key}` });
}
