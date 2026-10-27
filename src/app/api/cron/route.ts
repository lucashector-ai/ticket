import { NextResponse } from "next/server";
import { runCron } from "@/lib/cron";

/** Chamada pelo cron do Worker a cada minuto (ver custom-worker.js); o token só existe no isolate. */
export async function POST(req: Request) {
  const token = (globalThis as { __twCronToken?: string }).__twCronToken;
  if (!token || req.headers.get("x-cron-token") !== token) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await runCron());
}
