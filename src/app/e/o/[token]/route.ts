import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

/** Pixel de abertura: marca a primeira abertura e conta as outras. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (/^[0-9a-f]{32}$/.test(token)) {
    const s = schema.emailSends;
    await db.update(s).set({ opens: sql`${s.opens} + 1`, openedAt: sql`coalesce(${s.openedAt}, now())` }).where(eq(s.token, token)).catch(() => {});
  }
  return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
}
