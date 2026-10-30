import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/portaria/install";

export const metadata: Metadata = {
  title: "Portaria",
  manifest: "/portaria/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Portaria", statusBarStyle: "black-translucent" },
  icons: { apple: "/portaria/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  // iPhones mais antigos só abrem em tela cheia com a tag antiga
  other: { "apple-mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** App da portaria: tela própria, sem o cabeçalho do site, instalável na tela de início. */
export default function PortariaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pg-portaria">
      <RegisterSW />
      {children}
    </div>
  );
}
