import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark, BrandWord } from "@/components/brand-logo";
import { CodeCopy } from "./code-copy";

export const metadata: Metadata = { title: "Copiar código", robots: { index: false, follow: false } };

/** Aberta pelo botão "Copiar código" dos e-mails. O código vem no #hash (não vai para o servidor nem para os logs). */
export default function CodigoPage() {
  return (
    <main className="pg-codigo">
      <div className="cd-card">
        <Link href="/" className="cd-logo" aria-label="Tickets Win — início">
          <BrandMark size={30} />
          <BrandWord height={20} />
        </Link>
        <CodeCopy />
      </div>
    </main>
  );
}
