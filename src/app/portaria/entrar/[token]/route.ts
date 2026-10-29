import { NextResponse } from "next/server";
import { activeAccess, portariaCookie } from "@/lib/portaria";

/** Link (ou QR) do acesso de portaria: conecta este aparelho ao evento e abre o app. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = /^[A-Za-z0-9_-]{16,48}$/.test(token) ? await activeAccess({ token }) : null;
  const url = new URL("/portaria", req.url);
  if (!link) url.searchParams.set("erro", "link");
  const res = NextResponse.redirect(url, 303);
  if (link) res.cookies.set(portariaCookie(link.id));
  return res;
}
