/*
 * Limites da escolha de ingressos, iguais aos que o servidor confere em placeOrder/fulfillOrder:
 *   - máximo por compra (events.max_per_order): soma de todos os tipos num pedido;
 *   - limite por pessoa de cada tipo (min(ticket_types.max_per_order, máximo por compra)), somando o que a
 *     pessoa já comprou (pedidos pagos na conta e no CPF);
 *   - o que resta à venda do tipo.
 * Puro (sem banco), para a página do evento e para os testes.
 */

export type LimitTier = { id: string; name: string; status: string; available: number; limit: number; owned?: number };

/** `left`: quantos deste tipo ainda cabem na escolha; `reason`: por que não cabe mais nenhum (null se cabe). */
export function roomFor(tiers: LimitTier[], maxPerOrder: number, qty: Record<string, number>, id: string): { left: number; reason: string | null } {
  const tier = tiers.find((t) => t.id === id);
  if (!tier || tier.status !== "open") return { left: 0, reason: "Este ingresso não está à venda." };
  const sum = Object.values(qty).reduce((s, n) => s + n, 0);
  const cur = qty[id] ?? 0;
  const owned = Math.max(0, tier.owned ?? 0);
  const personLeft = Math.max(0, tier.limit - owned - cur);
  const orderLeft = Math.max(0, maxPerOrder - sum);
  const stockLeft = Math.max(0, tier.available - cur);
  const left = Math.min(personLeft, orderLeft, stockLeft);
  if (left > 0) return { left, reason: null };
  if (stockLeft === 0) return { left, reason: tier.available > 0 ? `Restam só ${tier.available} ${tier.available === 1 ? "ingresso" : "ingressos"} em ${tier.name}.` : `${tier.name} esgotou.` };
  if (personLeft === 0) {
    const lim = `O limite é ${tier.limit} ${tier.limit === 1 ? "ingresso" : "ingressos"} de ${tier.name} por pessoa.`;
    return { left, reason: owned ? `${lim} Você já tem ${owned}${cur ? ` e escolheu ${cur}` : ""}.` : lim };
  }
  return { left, reason: `Máximo de ${maxPerOrder} ingressos por compra, somando todos os tipos.` };
}

/** Ingressos já comprados de cada tipo: `all` conta para o limite (conta + CPF); `mine` só os desta conta. */
export type Bought = Map<string, { all: number; mine: number }>;

/** Confere o limite por pessoa de cada tipo; devolve a mensagem de erro (dizendo de onde vem a conta) ou null. */
export function overLimit(items: { ticketTypeId: string; quantity: number }[], types: { id: string; name: string; maxPerOrder: number }[], bought: Bought) {
  for (const it of items) {
    const tt = types.find((t) => t.id === it.ticketTypeId);
    if (!tt) continue;
    const { all: had, mine } = bought.get(tt.id) ?? { all: 0, mine: 0 };
    if (had + it.quantity > tt.maxPerOrder) {
      const lim = `O limite é ${tt.maxPerOrder} ${tt.maxPerOrder === 1 ? "ingresso" : "ingressos"} de ${tt.name} por pessoa, conferido pela conta e pelo CPF.`;
      if (!had) return lim;
      const left = Math.max(0, tt.maxPerOrder - had);
      const rest = left ? ` Você ainda pode comprar ${left}.` : " Não dá para comprar mais deste tipo.";
      const other = had - mine;
      if (!other) return `${lim} Esta conta já tem ${had}.${rest}`;
      return `${lim} Já existem ${had} ${had === 1 ? "ingresso" : "ingressos"} deste tipo comprados com o CPF informado${mine ? ` (${mine} nesta conta e ${other} em outra conta)` : ", em outra conta"}.${rest} Se não foi você, fale com a Tickets Win.`;
    }
  }
  return null;
}
