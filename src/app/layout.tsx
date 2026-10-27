import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { FavoritesProvider } from "@/components/favorites";

export const metadata: Metadata = {
  title: { default: "Tickets Win — Descubra eventos", template: "%s · Tickets Win" },
  description: "A forma mais simples de descobrir e viver os melhores eventos da sua cidade.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=Anton&family=Archivo+Black&family=Space+Mono:wght@400;700&family=Unbounded:wght@700;900&family=Syne:wght@700;800&family=DM+Serif+Display:ital@0;1&family=Instrument+Serif:ital@0;1&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <ToastProvider>
          <FavoritesProvider>{children}</FavoritesProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
