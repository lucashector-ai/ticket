import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { FavoritesProvider } from "@/components/favorites";
import { FONTS } from "@/lib/fonts";

export const metadata: Metadata = {
  title: { default: "Tickets Win — Descubra eventos", template: "%s · Tickets Win" },
  description: "A forma mais simples de descobrir e viver os melhores eventos da sua cidade.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#111111", width: "device-width", initialScale: 1 };



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
