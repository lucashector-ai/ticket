"use client";

import { useEffect, useRef } from "react";
import { finishAppleSignIn } from "@/lib/actions/apple";
import { AppleLogo } from "./apple-button";

/** Tela rápida depois da volta da Apple: termina o login no nosso site e segue para o destino. */
export function AppleFinish() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void finishAppleSignIn()
      .then((to) => window.location.replace(to))
      .catch(() => window.location.replace("/entrar?apple=erro"));
  }, []);
  return (
    <main className="ap-fin" role="status" aria-live="polite">
      <span className="ap-fin-ic"><AppleLogo size={28} /></span>
      <b>Entrando com a Apple…</b>
    </main>
  );
}
