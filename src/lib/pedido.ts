/* Rótulos do pedido do comprador (Minhas compras e detalhes do pedido). */

export type OrderPill = { label: string; cls: "ok" | "warn" | "azul" | "" };

/** Status para o comprador: reserva vencida conta como expirada; pago com algo devolvido é "Reembolso parcial". */
export function orderPill(o: { status: string; expiresAt: Date | null; refundedCents: number }, now = new Date()): OrderPill {
  if (o.status === "pending") return o.expiresAt && o.expiresAt < now ? { label: "Expirado", cls: "" } : { label: "Aguardando pagamento", cls: "warn" };
  if (o.status === "paid") return o.refundedCents > 0 ? { label: "Reembolso parcial", cls: "azul" } : { label: "Pago", cls: "ok" };
  if (o.status === "refunded") return { label: "Reembolsado", cls: "" };
  if (o.status === "expired") return { label: "Expirado", cls: "" };
  return { label: "Cancelado", cls: "" };
}

export const METHOD_LABEL: Record<string, string> = { pix: "Pix", card: "Cartão de crédito", free: "Grátis", test: "Teste" };

/** "***.456.789-**": só os dígitos do meio do CPF. */
export function maskCpfHidden(cpf: string | null | undefined) {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "";
}
