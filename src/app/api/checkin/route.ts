import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { checkinTicket } from "@/lib/checkin";
import { getPainelScope } from "@/lib/data/painel";

/** Check-in na portaria: body { payload: "ONDE|<code>|<sig>" }. Só para a equipe do produtor do evento. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Entre na conta da equipe para validar ingressos." }, { status: 401 });
  let payload = "";
  try {
    const body = (await req.json()) as { payload?: unknown };
    payload = typeof body.payload === "string" ? body.payload : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }
  const { events } = await getPainelScope(user);
  const r = await checkinTicket(payload, new Set(events.map((e) => e.id)));
  const { status, ...body } = r;
  return NextResponse.json(body, { status });
}
