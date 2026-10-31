import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * SEC-308 / SEC-011: IA de descrição e de mapa e detalhes do Google só para produtor com e-mail confirmado, com cota
 * por conta e teto da plataforma contados antes da chamada. A Anthropic, o banco e o contador são simulados.
 */
const state = { producer: true, verified: true };
const anthropicCalls: string[] = [];
vi.mock("@/lib/data/producer", () => ({ isProducer: async () => state.producer }));
vi.mock("@/lib/auth/verified", () => ({ emailConfirmed: async () => state.verified }));
let user: { id: string; email: string; emailVerified: boolean } | null = { id: "u-ia", email: "p@example.com", emailVerified: true };
vi.mock("@/lib/auth/server", () => ({ getSessionUser: async () => user }));
const tries = new Map<string, number>();
vi.mock("@/lib/attempts", () => ({
  reserveAttempt: async (subject: string, bucket: string, max: number) => {
    const k = `${subject}|${bucket}`, n = (tries.get(k) ?? 0) + 1;
    if (n > max) return { ok: false };
    tries.set(k, n);
    return { ok: true, n };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: async () => { anthropicCalls.push("desc"); return { content: [{ type: "text", text: "Texto." }] }; } }; },
}));

const post = async () => {
  const { POST } = await import("@/app/api/criar/descricao/route");
  return POST(new Request("http://localhost/api/criar/descricao", { method: "POST", body: JSON.stringify({ title: "Festa QA", cat: "", age: "", venue: "", city: "", when: "", lineup: [], current: "" }), headers: { "content-type": "application/json" } }));
};

describe("SEC-308: IA de descrição", () => {
  beforeEach(() => { tries.clear(); anthropicCalls.length = 0; Object.assign(state, { producer: true, verified: true }); user = { id: "u-ia", email: "p@example.com", emailVerified: true }; process.env.ANTHROPIC_API_KEY = "chave-falsa"; });

  it("conta que não é produtora (ou sem e-mail confirmado) recebe 403 e a IA não é chamada", async () => {
    state.producer = false;
    expect((await post()).status).toBe(403);
    state.producer = true; state.verified = false;
    expect((await post()).status).toBe(403);
    expect(anthropicCalls).toEqual([]);
  });

  it("30 por conta por dia, mesmo em paralelo: o resto recebe 429 sem chamar a IA", async () => {
    const r = await Promise.all(Array.from({ length: 35 }, () => post()));
    expect(r.filter((x) => x.status === 200)).toHaveLength(30);
    expect(r.filter((x) => x.status === 429)).toHaveLength(5);
    expect(anthropicCalls).toHaveLength(30);
  });

  it("teto da plataforma: passado o total do dia, ninguém mais usa", async () => {
    tries.set("plataforma|ia:desc", 1000);
    expect((await post()).status).toBe(429);
    expect(anthropicCalls).toEqual([]);
  });
});
