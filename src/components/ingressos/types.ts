export type TicketStatus = "valid" | "used" | "transferred" | "cancelled" | "refunded";

export type TicketItem = {
  id: string;
  code: string;
  holderName: string | null;
  status: TicketStatus;
  checkedInAt: string | null;
  /** SVG do QR code assinado (gerado no server com a lib qrcode). */
  qrSvg: string;
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
