import { eventLabels } from "@/lib/tickets/labels";

/** O que vai no ingresso "de papel" (PDF e e-mail): arte, título, data, local, portões, setor, tipo e o QR. */
export type TicketCardData = {
  code: string; title: string; flyerId: string; presenter: string; dateLine: string; placeLine: string;
  gates: string; sector: string; type: string; holder: string; orderNumber: number | null; age: string; valid: boolean;
};

type EventLike = Parameters<typeof eventLabels>[0] & { title: string; flyerId: string; ageRating?: string | null; organizer?: { name: string } | null };
type TicketLike = { code: string; holderName: string | null; halfPrice: boolean; status: string; ticketType: { name: string; sector: string | null; kind?: string | null }; order?: { number: number | null } | null };

const STD_KINDS = new Set(["inteira", "meia", "social"]);

/** "23h59 · até 8h" → "23:59"; sem horário, "—". */
function gatesOf(doors: string) {
  const m = doors.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : "—";
}

export function ticketCard(t: TicketLike, e: EventLike): TicketCardData {
  const L = eventLabels(e);
  return {
    code: t.code, title: e.title, flyerId: e.flyerId,
    presenter: e.organizer?.name ?? "",
    dateLine: [L.dateFull, L.doors].filter(Boolean).join(" · "),
    placeLine: [L.venue, L.addr].filter(Boolean).join(" · "),
    gates: gatesOf(L.doors),
    // sem setor: Inteira/Meia/Social do criador são "Geral" (o tipo já vai na coluna Tipo); tipos antigos e
    // próprios ("Pista — 1º lote", "VIP") seguem pelo nome
    sector: t.ticketType.sector || (t.ticketType.kind && STD_KINDS.has(t.ticketType.kind) ? "Geral" : t.ticketType.name.split(/\s+[—–-]\s+/)[0] || t.ticketType.name),
    // meia marcada no checkout ou tipo próprio de meia/social (o titular apresenta o documento na entrada)
    type: t.halfPrice || t.ticketType.kind === "meia" ? "Meia" : t.ticketType.kind === "social" ? "Social" : "Inteira",
    holder: t.holderName ?? "",
    orderNumber: t.order?.number ?? null,
    age: (e.ageRating ?? "").split(/[\s·,]/)[0] ?? "",
    valid: t.status === "valid",
  };
}
