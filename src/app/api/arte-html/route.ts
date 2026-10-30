import { ART_FRAME_CSP, ART_FRAME_HTML } from "@/lib/art-frame";

/** Palco das artes em HTML dos banners (ver src/lib/art-frame.ts). Página fixa, sem dados: pode ficar em cache. */
export function GET() {
  return new Response(ART_FRAME_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": ART_FRAME_CSP,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
