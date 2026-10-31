import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-303 / SEC-006: o proxy /api/auth/* é lista de permissão (só o que o navegador do site usa) e o código de
 * ativação tem freio próprio; o webhook do Neon Auth não manda código/link além do freio. Nada vai ao Neon Auth real:
 * o handler do SDK, o KV, o banco e o envio de e-mail são simulados.
 */
const called: string[] = [];
const fakeHandler = {
  GET: async (req: Request) => { called.push(`GET ${new URL(req.url).pathname}`); return new Response("ok"); },
  POST: async (req: Request) => { called.push(`POST ${new URL(req.url).pathname}`); return new Response("ok"); },
};
vi.mock("@/lib/auth/server", () => ({ auth: { handler: () => fakeHandler } }));
const tries = new Map<string, number>();
vi.mock("@/lib/attempts", () => ({
  reserveAttempt: async (subject: string, bucket: string, max: number) => {
    const k = `${subject}|${bucket}`, n = (tries.get(k) ?? 0) + 1;
    if (n > max) return { ok: false };
    tries.set(k, n);
    return { ok: true, n };
  },
}));

const call = async (method: "GET" | "POST", path: string[], body?: unknown, ip = "203.0.113.9") => {
  const { GET, POST } = await import("@/app/api/auth/[...path]/route");
  const req = new NextRequest(`http://localhost/api/auth/${path.join("/")}`, {
    method, headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined,
  });
  const ctx = { params: Promise.resolve({ path }) } as never;
  return method === "GET" ? GET(req, ctx) : POST(req, ctx);
};

describe("SEC-303: proxy do Neon Auth com lista de permissão", () => {
  beforeEach(() => { called.length = 0; tries.clear(); });

  it("o que o site usa passa: sessão, token, sair, Google (início e volta), código de ativação", async () => {
    for (const [m, p] of [["GET", "get-session"], ["GET", "token"], ["POST", "sign-out"], ["POST", "sign-in/social"], ["GET", "callback/google"], ["POST", "email-otp/verify-email"]] as const) {
      const r = await call(m, p.split("/"), m === "POST" ? { email: "a@example.com", otp: "123456" } : undefined);
      expect(r.status, `${m} ${p}`).toBe(200);
    }
    expect(called).toHaveLength(6);
  });

  it("rotas de código, senha, link mágico, conta e admin dão 403 sem chegar ao Neon Auth", async () => {
    const blocked = [
      "email-otp/send-verification-otp", "forget-password/email-otp", "email-otp/request-password-reset", "email-otp/reset-password",
      "email-otp/check-verification-otp", "sign-in/magic-link", "request-password-reset", "reset-password", "send-verification-email",
      "sign-in/email", "sign-up/email", "sign-in/email-otp", "change-email", "email-otp/change-email", "change-password", "update-user",
      "delete-user", "list-sessions", "revoke-sessions", "link-social", "unlink-account", "admin/list-users", "organization/create", "verify-email",
      "SIGN-IN/EMAIL",
    ];
    for (const p of blocked) {
      const r = await call("POST", p.split("/"), { email: "vitima@example.com" });
      expect(r.status, p).toBe(403);
      expect(await r.json()).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(called).toEqual([]);
  });

  it("método diferente do que o site usa e caminho estranho também são recusados", async () => {
    expect((await call("POST", ["get-session"], {})).status).toBe(403);
    expect((await call("GET", ["sign-out"])).status).toBe(403);
    expect((await call("GET", ["callback", "..", "sign-in", "email"])).status).toBe(403);
    expect((await call("GET", ["sign-in%2Femail"])).status).toBe(403);
    expect(called).toEqual([]);
  });

  it("código de ativação: no máximo 5 tentativas por e-mail (o 6º recebe 429) e 20 por IP", async () => {
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await call("POST", ["email-otp", "verify-email"], { email: "Pessoa@Example.com", otp: "000000" }, `198.51.100.${i}`)).status);
    expect(st).toEqual([200, 200, 200, 200, 200, 429]);
    // mesmo e-mail com maiúsculas diferentes conta junto; outro e-mail passa
    expect((await call("POST", ["email-otp", "verify-email"], { email: "outra@example.com", otp: "000000" }, "198.51.100.50")).status).toBe(200);
    tries.clear();
    const byIp: number[] = [];
    for (let i = 0; i < 21; i++) byIp.push((await call("POST", ["email-otp", "verify-email"], { email: `p${i}@example.com`, otp: "000000" }, "192.0.2.1")).status);
    expect(byIp.filter((s) => s === 200)).toHaveLength(20);
    expect(byIp[20]).toBe(429);
  });
});

/* ---------- webhook do Neon Auth: freio antes de mandar código/link ---------- */
const kv = new Map<string, string>();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { KV: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) } } }),
}));
let nextEvent: Record<string, unknown> = {};
vi.mock("@/lib/auth/webhook", () => ({ verifyNeonWebhook: async () => nextEvent }));
vi.mock("@/lib/auth/apple", () => ({ catchAppleOtp: async () => false }));
const mails: string[] = [];
vi.mock("@/lib/email", () => ({ emailEnabled: () => true, logEmails: async () => {} }));
vi.mock("@/lib/notify", () => ({
  mailAuthCode: async (type: string, to: string) => { mails.push(`${type}:${to}`); return true; },
  mailAuthLink: async (type: string, to: string) => { mails.push(`link:${type}:${to}`); return true; },
  mailWelcome: async () => true,
}));

describe("SEC-303: webhook do Neon Auth com freio por destinatário", () => {
  beforeEach(() => { kv.clear(); mails.length = 0; });
  const hook = async (id: string, type = "forget-password", to = "vitima@example.com") => {
    nextEvent = { event_id: id, event_type: "send.otp", user: { email: to }, event_data: { otp_type: type, otp_code: "123456" } };
    const { POST } = await import("@/app/api/webhooks/neon-auth/route");
    return POST(new Request("http://localhost/api/webhooks/neon-auth", { method: "POST", body: "{}" }));
  };

  it("pedidos seguidos ao Neon Auth para o mesmo e-mail viram no máximo 1 e-mail no intervalo", async () => {
    const r: { throttled?: boolean }[] = [];
    for (let i = 0; i < 5; i++) r.push(await (await hook(`ev-${i}`)).json());
    expect(mails).toEqual(["forget-password:vitima@example.com"]);
    expect(r.slice(1).every((x) => x.throttled)).toBe(true);
    // outro destinatário e outro tipo não são afetados
    await hook("ev-x", "forget-password", "outra@example.com");
    await hook("ev-y", "email-verification");
    expect(mails).toHaveLength(3);
  });
});
