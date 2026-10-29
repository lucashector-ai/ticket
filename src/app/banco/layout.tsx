import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Banco Tickets Win", template: "%s · Banco Tickets Win" }, robots: { index: false, follow: false } };

/** Área do banco: visual próprio, sem o cabeçalho do site. */
export default function BancoLayout({ children }: { children: React.ReactNode }) {
  return <div className="pg-banco">{children}</div>;
}
