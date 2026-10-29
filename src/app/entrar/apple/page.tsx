import type { Metadata } from "next";
import { AppleFinish } from "@/components/auth/apple-finish";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrando com a Apple", robots: { index: false } };

export default function EntrarApplePage() {
  return (
    <div className="pg-entrar">
      <AppleFinish />
    </div>
  );
}
