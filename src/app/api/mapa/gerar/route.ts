import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { AREA_KINDS, MAX_AREAS, normalizePlan, type AreaKind, type VenuePlan } from "@/lib/criar/plan";

/** Gerações por produtor por dia (cada uma é uma chamada paga à API). */
const DAILY_LIMIT = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const inputSchema = z.object({
  sketchUrl: z.string().regex(/^\/midia\/eventos\/[\w/.-]+$/).nullable(),
  prompt: z.string().max(1000),
  sectors: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().max(80) })).max(20),
});

/** O que o Claude devolve: a planta em metros, com origem no canto do fundo à esquerda. */
const planSchema = z.object({
  largura_m: z.number().describe("Largura total do local, em metros (eixo x, da esquerda para a direita)."),
  profundidade_m: z.number().describe("Profundidade total do local, em metros (eixo y, da parede do fundo até a entrada)."),
  areas: z.array(z.object({
    nome: z.string().describe("Nome curto da área em português, como escrito no rascunho quando houver."),
    tipo: z.string().describe(`Um destes: ${AREA_KINDS.join(", ")}. setor = área onde o público fica e que tem ingresso; outro = qualquer outra coisa.`),
    x_m: z.number().describe("Distância da parede esquerda até o lado esquerdo da área, em metros."),
    y_m: z.number().describe("Distância da parede do fundo até o lado de trás da área, em metros."),
    largura_m: z.number(),
    profundidade_m: z.number(),
    altura_m: z.number().describe("Altura do piso da área ou da estrutura: pista ~0.2, palco ~1.5, camarote elevado ~1.2 a 3."),
    lotacao: z.number().describe("Para setores: pessoas estimadas (em pé ~2,5 por m²; sentado, o número de lugares). 0 para os demais tipos."),
    setor_id: z.string().nullable().describe("Para setores: o id do setor de ingressos que melhor corresponde a esta área, ou null."),
  })),
  observacoes: z.array(z.string()).describe("Até 4 avisos curtos em português para o produtor conferir (medidas incertas, saídas não indicadas...)."),
});

const SYSTEM = `Você transforma rascunhos e plantas de locais de eventos em uma planta simplificada, feita só de retângulos alinhados aos eixos, em metros.
Regras:
- Origem no canto do fundo à esquerda. O eixo y vai da parede do fundo (normalmente onde fica o palco) até a entrada; o eixo x vai da esquerda para a direita, olhando para o palco.
- Use as medidas escritas no rascunho ou na descrição. Sem medidas, estime pelo tipo de local e pelas proporções do desenho, e diga isso nas observações.
- Cada área é um retângulo dentro do local; áreas não se sobrepõem. Áreas curvas ou irregulares viram o retângulo que melhor as cobre.
- Marque como "setor" só onde o público fica (pista, área VIP, camarote, arquibancada, plateia). Ligue cada setor ao setor de ingressos de nome mais parecido; se nenhum servir, use null.
- No máximo ${MAX_AREAS} áreas. Nomes curtos, em português.`;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para gerar o mapa." }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "A geração por IA não está configurada neste ambiente." }, { status: 503 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { sketchUrl, prompt, sectors } = parsed.data;
  if (!sketchUrl && prompt.trim().length < 15) return NextResponse.json({ error: "Envie um rascunho ou descreva o espaço com mais detalhes." }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true });
  const day = new Date().toISOString().slice(0, 10);
  const quotaKey = `mapa-ia:${user.id}:${day}`;
  const used = Number((await env.KV.get(quotaKey)) ?? 0);
  if (used >= DAILY_LIMIT) return NextResponse.json({ error: `Limite de ${DAILY_LIMIT} gerações por dia atingido. Ajuste o mapa no editor ou tente amanhã.` }, { status: 429 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (sketchUrl) {
    const obj = await env.MEDIA.get(sketchUrl.replace(/^\/midia\//, ""));
    if (!obj) return NextResponse.json({ error: "Não encontrei o rascunho enviado. Envie de novo." }, { status: 404 });
    const type = obj.httpMetadata?.contentType;
    if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return NextResponse.json({ error: "O rascunho precisa ser JPG, PNG ou WebP." }, { status: 415 });
    const bytes = await obj.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: "O rascunho passa de 5 MB. Envie uma foto menor." }, { status: 413 });
    content.push({ type: "image", source: { type: "base64", media_type: type, data: Buffer.from(bytes).toString("base64") } });
  }
  content.push({
    type: "text",
    text: [
      sketchUrl ? "Monte a planta do local a partir deste rascunho." : "Monte a planta do local a partir desta descrição.",
      prompt.trim() ? `Descrição do produtor: ${prompt.trim()}` : "",
      sectors.length ? `Setores de ingresso do evento (id: nome): ${sectors.map((s) => `${s.id}: ${s.name}`).join("; ")}` : "O evento ainda não tem setores de ingresso.",
    ].filter(Boolean).join("\n\n"),
  });

  await env.KV.put(quotaKey, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  const client = new Anthropic({ apiKey });
  let message;
  try {
    message = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(planSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "A IA está ocupada agora. Tente de novo em instantes." }, { status: 503 });
    if (err instanceof Anthropic.APIError) {
      console.error("mapa-ia", err.status, err.message);
      return NextResponse.json({ error: "Não foi possível gerar o mapa agora. Tente de novo." }, { status: 502 });
    }
    console.error("mapa-ia", err);
    return NextResponse.json({ error: "A IA devolveu uma planta que não consegui ler. Tente de novo." }, { status: 502 });
  }
  if (message.stop_reason === "refusal") return NextResponse.json({ error: "A IA não conseguiu ler esse rascunho. Tente outra imagem ou descreva o espaço." }, { status: 422 });
  const out = message.parsed_output;
  if (!out || !out.areas.length) return NextResponse.json({ error: "A IA não encontrou áreas nesse rascunho. Tente uma foto mais nítida ou descreva o espaço." }, { status: 422 });

  const plan: VenuePlan = normalizePlan({
    width: out.largura_m, depth: out.profundidade_m, source: "ia", notes: out.observacoes.slice(0, 4),
    areas: out.areas.map((a, i) => ({
      id: `ia${i}`, name: a.nome, kind: (AREA_KINDS as readonly string[]).includes(a.tipo.trim().toLowerCase()) ? (a.tipo.trim().toLowerCase() as AreaKind) : "outro", x: a.x_m, y: a.y_m, w: a.largura_m, d: a.profundidade_m, h: a.altura_m,
      cap: a.lotacao, sector: a.setor_id,
    })),
  }, sectors.map((s) => s.id));
  return NextResponse.json({ plan, remaining: DAILY_LIMIT - used - 1 });
}
