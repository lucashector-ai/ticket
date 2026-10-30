import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { eventLabels, forSession } from "@/lib/tickets/labels";

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

/** Arquivo .ics do evento do ingresso (adicionar à agenda / Wallet). Só o titular baixa. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const t = await getTicketByCode(code);
  if (!t || t.holderUserId !== user.id) return NextResponse.json({ error: "Ingresso não encontrado." }, { status: 404 });

  // várias datas: a agenda recebe o dia do ingresso, não o período todo
  const ev = forSession(t.event, t.ticketType.session);
  const L = eventLabels(ev);
  const start = ev.startAt;
  const end = ev.endAt ?? new Date(start.getTime() + 4 * 3600_000);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const url = `${site}/ingressos/${t.code}`;
  const desc = `Ingresso ${t.code} · ${t.ticketType.name}${t.holderName ? ` · Titular: ${t.holderName}` : ""}${L.doors ? `\n${L.doors}` : ""}\nAbra o QR code em ${url}`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tickets Win//Ingressos//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${t.code}@onde`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(t.event.title)}`,
    `LOCATION:${esc([L.venue, L.addr].filter(Boolean).join(" — "))}`,
    `DESCRIPTION:${esc(desc)}`,
    `URL:${url}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="ticketswin-${t.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
