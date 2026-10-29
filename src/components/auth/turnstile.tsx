"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Verificador de humanos da Cloudflare. Dentro de um <form> o widget cria o campo `cf-turnstile-response`;
 * fora dele, use `onToken`. Só aparece quando a Cloudflare precisa de uma interação; quando `resetKey` muda
 * (ex.: a resposta de uma tentativa de login), pede um token novo, porque cada token vale uma vez só.
 */
export function Turnstile({ siteKey, onToken, resetKey, action }: { siteKey: string | null; onToken?: (t: string) => void; resetKey?: unknown; action?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: siteKey, action, language: "pt-br", appearance: "interaction-only", theme: "light",
        callback: (t: string) => cb.current?.(t),
        "expired-callback": () => cb.current?.(""),
        "error-callback": () => cb.current?.(""),
      });
    }).catch(() => {});
    return () => { gone = true; if (id.current && window.turnstile) window.turnstile.remove(id.current); id.current = null; };
  }, [siteKey, action]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (id.current && window.turnstile) { window.turnstile.reset(id.current); cb.current?.(""); }
  }, [resetKey]);

  if (!siteKey) return null;
  return <div className="cf-human" ref={box} />;
}
