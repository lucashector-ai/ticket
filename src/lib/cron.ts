import "server-only";
import { runLaunchJobs } from "@/lib/launch-notify";

/** Tarefas do cron (a cada minuto). Cada uma falha sozinha, sem derrubar as outras. */
export async function runCron() {
  const out: Record<string, unknown> = {};
  const jobs: [string, () => Promise<unknown>][] = [["launch", () => runLaunchJobs()]];
  for (const [name, job] of jobs) {
    try { out[name] = await job(); } catch (e) { console.error("cron", name, e); out[name] = "erro"; }
  }
  return out;
}
