import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/*
 * Cabeçalhos de segurança em todas as respostas. Sem CSP de scripts por enquanto (Turnstile, login do
 * Google, VLibras, Spotify e os banners em HTML precisariam de uma lista cuidadosa); estes não quebram nada:
 * o site só pode ser emoldurado por ele mesmo, a câmera fica só para a portaria do próprio site.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // o indicador do modo dev ficava em cima do botão de acessibilidade (canto inferior esquerdo)
  devIndicators: false,
  images: {
    // Imagens são servidas do R2 / Cloudflare Images; sem otimização no build.
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Permite usar bindings do Cloudflare (R2, KV) durante `next dev`.
initOpenNextCloudflareForDev();
