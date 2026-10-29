import { randomBytes } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { adminUser } from "@/lib/admin";

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Arte de banner enviada na central (PNG, JPG, WebP ou GIF). Só admin com app autenticador. */
export async function POST(req: Request) {
  const a = await adminUser();
  if (!a) return new NextResponse(null, { status: 404 });
  if (!a.secure) return NextResponse.json({ error: "Ative o app autenticador para usar a central." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Envie PNG, JPG, WebP ou GIF." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "O arquivo passa de 15 MB." }, { status: 413 });
  const key = `destaques/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  const { env } = await getCloudflareContext({ async: true });
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  return NextResponse.json({ url: `/midia/${key}` });
}
