import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiAllowed } from "@/lib/ai-quota";
import { getSessionUser } from "@/lib/auth/server";

const inputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  cat: z.string().max(60),
  age: z.string().max(20),
  venue: z.string().max(160),
  city: z.string().max(120),
  when: z.string().max(200),
  lineup: z.array(z.string().max(160)).max(30),
  current: z.string().max(6000),
});

const SYSTEM = `Você escreve a descrição da página de um evento na Tickets Win, uma plataforma brasileira de ingressos.
Regras:
- Português do Brasil, tom animado e direto, sem exageros nem promessas que o produtor não fez.
- Dois parágrafos curtos (no máximo 90 palavras no total), separados por uma linha em branco.
- Use só as informações recebidas. Não invente atrações, horários, preços, open bar ou brindes.
- Sem emojis, sem hashtags, sem títulos, sem aspas, sem markdown.
- Se o produtor já escreveu um rascunho, melhore o texto dele mantendo os fatos.`;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para usar a IA." }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "A escrita com IA não está configurada neste ambiente." }, { status: 503 });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dê um nome ao evento antes de pedir a descrição." }, { status: 400 });
  const d = parsed.data;

  // só produtor confirmado, com cota por conta e teto da plataforma contados antes da chamada (SEC-308)
  const quota = await aiAllowed(user, "desc");
  if (!quota.ok) return NextResponse.json({ error: quota.error }, { status: quota.status });

  const facts = [
    `Nome: ${d.title}`, d.cat && `Tipo: ${d.cat}`, d.age && `Classificação: ${d.age}`, d.when && `Quando: ${d.when}`,
    (d.venue || d.city) && `Onde: ${[d.venue, d.city].filter(Boolean).join(", ")}`, d.lineup.length ? `Line-up: ${d.lineup.join(", ")}` : "",
    d.current.trim() && `Rascunho do produtor:\n${d.current.trim()}`,
  ].filter(Boolean).join("\n");
  try {
    const msg = await new Anthropic({ apiKey }).messages.create({
      model: "claude-opus-5-5", max_tokens: 800, system: SYSTEM,
      messages: [{ role: "user", content: `Escreva a descrição deste evento.\n\n${facts}` }],
    });
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text) return NextResponse.json({ error: "A IA não conseguiu escrever agora. Tente de novo." }, { status: 502 });
    return NextResponse.json({ text: text.slice(0, 6000) });
  } catch (err) {
    console.error("desc-ia", err);
    return NextResponse.json({ error: "Não foi possível escrever agora. Tente de novo." }, { status: 502 });
  }
}
