import type { TicketCardData } from "@/lib/tickets/card";

export type TicketStatus = "valid" | "used" | "transferred" | "cancelled" | "refunded";

export type TicketItem = {
  id: string;
  code: string;
  holderName: string | null;
  status: TicketStatus;
  checkedInAt: string | null;
  /** SVG do QR code assinado (gerado no server com a lib qrcode). */
  qrSvg: string;
  /** enviado para outra pessoa e ainda não aceito (o ingresso volta se o envio for cancelado) */
  sentTo?: { transferId: string; email: string; gift: boolean } | null;
  /** dados do ingresso "de papel" para o PDF */
  card?: TicketCardData;
};

/** Pedido criado e não pago, dentro da reserva: "Aguardando pagamento" com o botão de pagar. */
export type PendingOrderView = {
  id: string; number: number; title: string; flyerId: string; dateNice: string; venue: string;
  items: string; totalCents: number; method: "pix" | "card" | "free"; secondsLeft: number;
};

/** Ingresso enviado para outra pessoa (na compra ou por Transferir). */
export type SentView = {
  id: string; ticketId: string; toEmail: string; status: "pending" | "accepted"; gift: boolean;
  holderName: string | null; tier: string; eventTitle: string;
};

/** Ingresso enviado para o e-mail da conta, esperando a pessoa receber. */
export type IncomingView = {
  token: string; title: string; flyerId: string; dateNice: string; venue: string; tier: string; holderName: string | null; gift: boolean;
};

/** Um "ingresso" do design: todos os ingressos de um pedido (mesmo evento). */
export type TicketGroup = {
  key: string;
  /** pedido do grupo quando é um só (com várias compras do mesmo evento, null) */
  orderNumber: number | null;
  orderNumbers: number[];
  /** o evento já acabou (senão está em Anteriores porque os ingressos já foram usados) */
  ended: boolean;
  eventSlug: string;
  title: string;
  flyerId: string;
  startAt: string;
  upcoming: boolean;
  countdown: string;
  dateFull: string;
  dateNice: string;
  datePast: string;
  doors: string;
  venue: string;
  addr: string;
  city: string;
  tier: string;
  /** o produtor permite a revenda oficial deste evento */
  resale: boolean;
  /** o produtor permite transferir */
  transfer: boolean;
  tickets: TicketItem[];
};
