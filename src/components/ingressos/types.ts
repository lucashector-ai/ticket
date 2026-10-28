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
  orderNumber: number | null;
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
  tickets: TicketItem[];
};
