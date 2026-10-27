// Worker do Cloudflare: o app do OpenNext + o cron (a cada minuto), que chama /api/cron no próprio app.
// O token fica no globalThis do isolate, então só o cron consegue chamar a rota.
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const worker = {
  fetch: handler.fetch,
  async scheduled(controller, env, ctx) {
    const token = crypto.randomUUID();
    globalThis.__twCronToken = token;
    const site = env.NEXT_PUBLIC_SITE_URL || "https://ticket.oobo-site.workers.dev";
    const req = new Request(new URL("/api/cron", site), { method: "POST", headers: { "x-cron-token": token } });
    ctx.waitUntil(handler.fetch(req, env, ctx));
  },
};

export default worker;
