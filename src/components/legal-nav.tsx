"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/legal/termos", label: "Termos de uso" },
  { href: "/legal/privacidade", label: "Política de privacidade" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/acessibilidade", label: "Acessibilidade" },
];

export function LegalNav() {
  const path = usePathname();
  return (
    <nav className="in-side" aria-label="Documentos legais">
      <small>Legal</small>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={path === i.href ? "on" : undefined} aria-current={path === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
