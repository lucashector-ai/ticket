import { unsubscribe } from "@/lib/mail/unsubscribe";

/** Descadastro em um clique pelo botão do Gmail / Apple Mail (RFC 8058). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await unsubscribe(token);
  return new Response("ok");
}
