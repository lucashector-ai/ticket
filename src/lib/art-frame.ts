/*
 * Palco das artes em HTML (banner da home de evento e banner livre): o HTML não roda mais num iframe `srcdoc`, que
 * herda a CSP da página (com o bloqueio ligado, o script da arte era barrado e o banner ficava só com o fundo).
 * O iframe abre ART_FRAME_SRC, uma página do próprio site com CSP própria: `sandbox allow-scripts` (origem opaca,
 * sem cookies, sem a conta e sem navegar o site, mesmo se aberta fora do iframe), scripts e estilos inline só
 * dentro dela, nenhuma conexão (connect-src 'none'), sem formulários, e só pode ser emoldurada pelo próprio site.
 * O site manda o HTML por postMessage ({ twArt: html }) e a página escreve o documento.
 */
export const ART_FRAME_SRC = "/api/arte-html";

/**
 * Script do palco: avisa a página que está pronto ({ twArtReady: 1 }) e aceita o HTML só da página que o emoldura.
 * O document.open apaga os ouvintes: o HTML é escrito uma vez só.
 */
export const ART_FRAME_SCRIPT = `addEventListener("message",function(e){if(e.source!==parent||!e.data||typeof e.data.twArt!=="string")return;document.open();document.write(e.data.twArt);document.close()});parent.postMessage({twArtReady:1},"*");`;

export const ART_FRAME_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

export const ART_FRAME_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex"><style>html,body{margin:0;background:transparent}</style><script>${ART_FRAME_SCRIPT}</script></head><body></body></html>`;
