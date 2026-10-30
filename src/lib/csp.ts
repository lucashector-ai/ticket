import { createHash } from "node:crypto";
import { LD_SEEN_SCRIPT } from "@/lib/inline-scripts";

/*
 * Política de segurança de conteúdo (CSP) das páginas. Scripts: só os do próprio site com o nonce do pedido
 * ('strict-dynamic': o que esses scripts carregam também vale, como o Turnstile, o Stripe.js e o VLibras) e os
 * scripts escritos na página pelo hash. Um script injetado (XSS) não tem o nonce e não roda.
 * 'unsafe-inline' e https: no script-src só valem para navegadores antigos, que não entendem nonce/strict-dynamic
 * (os atuais ignoram os dois quando há nonce).
 *
 * Modo (CSP_MODE): "report" (padrão) manda o cabeçalho Content-Security-Policy-Report-Only, que só avisa e
 * não bloqueia nada; "enforce" bloqueia. Decisão em docs/quality-audit/pending-decisions.md (D-10).
 */

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const INLINE_HASHES = [LD_SEEN_SCRIPT].map(sha).join(" ");

/** Hosts de terceiros que o site usa no navegador (fora o próprio site). */
const HOSTS = {
  turnstile: "https://challenges.cloudflare.com",
  stripe: "https://js.stripe.com https://*.stripe.com https://*.stripe.network",
  vlibras: "https://vlibras.gov.br https://*.vlibras.gov.br",
  fonts: "https://fonts.googleapis.com",
  fontFiles: "https://fonts.gstatic.com",
  spotify: "https://open.spotify.com",
  viacep: "https://viacep.com.br",
};

export const cspMode = (): "report" | "enforce" => (process.env.CSP_MODE === "enforce" ? "enforce" : "report");
export const cspHeaderName = () => (cspMode() === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only");

export function newNonce() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === "development") {
  return [
    "default-src 'self'",
    // em desenvolvimento o React usa eval para mostrar os erros do servidor no navegador
    // 'wasm-unsafe-eval': o VLibras (Libras) roda num player WebAssembly; só libera compilar WebAssembly, não eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${INLINE_HASHES} 'wasm-unsafe-eval' https: 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    // estilos: o React escreve muitos atributos style; o risco de estilo injetado é baixo perto do de script
    `style-src 'self' 'unsafe-inline' ${HOSTS.fonts} ${HOSTS.vlibras}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data: ${HOSTS.fontFiles} ${HOSTS.vlibras}`,
    `connect-src 'self' ${HOSTS.viacep} ${HOSTS.turnstile} ${HOSTS.stripe} ${HOSTS.fonts} ${HOSTS.vlibras}${dev ? " ws: wss:" : ""}`,
    `frame-src 'self' ${HOSTS.turnstile} ${HOSTS.stripe} ${HOSTS.spotify} ${HOSTS.vlibras}`,
    "worker-src 'self' blob:",
    "media-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
    "report-to csp",
  ].join("; ");
}
