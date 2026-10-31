import "server-only";
import { reserveAttempt } from "@/lib/attempts";
import { emailConfirmed } from "@/lib/auth/verified";
import { isProducer } from "@/lib/data/producer";

/*
 * Recursos pagos do criador de eventos (IA de descrição e de mapa, detalhes do Google Places) só para produtor
 * (dona, equipe ou produtor antigo) com o e-mail confirmado, com cota por conta e um teto diário para a plataforma
 * inteira (SEC-308, SEC-011). As cotas são contadas antes de chamar o serviço, de forma atômica (contador no banco):
 * pedidos em paralelo não passam do limite. Em 24 h corridas (não por dia do calendário).
 */
export const AI_QUOTA = {
  desc: { perUser: 30, global: 1000, label: "textos" },
  mapa: { perUser: 20, global: 300, label: "gerações de mapa" },
  places: { perUser: 100, global: 3000, label: "consultas de endereço" },
} as const;
export type AiFeature = keyof typeof AI_QUOTA;

type Out = { ok: true; n: number } | { ok: false; status: 403 | 429 | 503; error: string };

export async function aiAllowed(user: { id: string; email?: string | null; emailVerified?: boolean | null }, feature: AiFeature): Promise<Out> {
  if (!(await isProducer(user)) || !(await emailConfirmed(user))) return { ok: false, status: 403, error: "Recurso disponível para produtores com o e-mail confirmado." };
  const q = AI_QUOTA[feature];
  try {
    const mine = await reserveAttempt(user.id, `ia:${feature}`, q.perUser, 86_400);
    if (!mine.ok) return { ok: false, status: 429, error: `Limite de ${q.perUser} ${q.label} por dia atingido. Tente amanhã.` };
    if (!(await reserveAttempt("plataforma", `ia:${feature}`, q.global, 86_400)).ok) {
      console.warn(JSON.stringify({ k: "abuse", op: `ia:${feature}`, key: "teto-global" }));
      return { ok: false, status: 429, error: "O recurso está indisponível agora. Tente de novo mais tarde." };
    }
    return { ok: true, n: mine.n };
  } catch (e) {
    console.error("ai quota", e);
    return { ok: false, status: 503, error: "O recurso está indisponível agora. Tente de novo em instantes." };
  }
}
