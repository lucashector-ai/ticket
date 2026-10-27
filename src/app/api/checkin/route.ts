import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { qrPayload } from "@/lib/actions/tickets";
import { getTicketByCode } from "@/lib/data/ingressos";

// TODO: proteger este endpoint com a chave do produtor (header Authorization) antes de abrir para o app de portaria.

const PAYLOAD_RE = /^ONDE\|(ONDE-[A-Z0-9]{4}-[A-Z0-9]{4})\|([A-Za-z0-9_-]{16})$/;

function same(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Check-in na portaria: body { payload: "ONDE|<code>|<sig>" }. */
export async function POST(req: Request) {
  let payload = "";
  try {
    const body = (await req.json()) as { payload?: unknown };
    payload = typeof body.payload === "string" ? body.payload.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }
  const m = PAYLOAD_RE.exec(payload);
  if (!m) return NextResponse.json({ ok: false, error: "QR code inválido." }, { status: 404 });

  const ticket = await getTicketByCode(m[1]);
  if (!ticket) return NextResponse.json({ ok: false, error: "Ingresso não encontrado." }, { status: 404 });
  const expected = await qrPayload(ticket.code, ticket.secret);
  if (!same(expected, payload)) return NextResponse.json({ ok: false, error: "QR code inválido." }, { status: 404 });

  const info = { code: ticket.code, holderName: ticket.holderName, event: ticket.event.title, ticketType: ticket.ticketType.name };
  if (ticket.status === "used") {
    return NextResponse.json({ ok: false, error: "Ingresso já utilizado.", checkedInAt: ticket.checkedInAt, ticket: info }, { status: 409 });
  }
  if (ticket.status !== "valid") {
    const why = ticket.status === "transferred" ? "transferido" : ticket.status === "refunded" ? "reembolsado" : "cancelado";
    return NextResponse.json({ ok: false, error: `Ingresso ${why}.`, ticket: info }, { status: 409 });
  }
  const now = new Date();
  await db.update(schema.tickets).set({ status: "used", checkedInAt: now }).where(eq(schema.tickets.id, ticket.id));
  return NextResponse.json({ ok: true, checkedInAt: now, ticket: info });
}
