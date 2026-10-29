/* Service worker do app da portaria: só o necessário para instalar e avisar quando estiver sem internet.
   A leitura dos ingressos sempre passa pelo servidor (nada de cache de dados). */
const OFFLINE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Sem internet</title>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<b style="font-size:24px">Sem internet</b><span style="color:#A1A1A6;max-width:300px;line-height:1.5">A portaria precisa de conexão para validar cada ingresso. Confira o Wi-Fi ou os dados móveis.</span>
<button onclick="location.reload()" style="margin-top:12px;height:52px;padding:0 28px;border:0;border-radius:999px;background:#D3F55B;color:#111;font-size:16px;font-weight:700">Tentar de novo</button></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
});
