import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Serve as imagens enviadas pelos produtores (bucket R2 onde-media). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (!path.startsWith("eventos/") || path.includes("..")) return new Response("Não encontrado", { status: 404 });
  const { env } = await getCloudflareContext({ async: true });
  const obj = await env.MEDIA.get(path);
  if (!obj) return new Response("Não encontrado", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
