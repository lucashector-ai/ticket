import "server-only";
import { runLaunchJobs } from "@/lib/launch-notify";
import { runEmailJobs } from "@/lib/mail/send";
import { pruneEmailLog, runReminders } from "@/lib/notify";
import { queueCleanup } from "@/lib/queue";

/** Tarefas do cron (a cada minuto). Cada uma falha sozinha, sem derrubar as outras. */
export async function runCron() {
  const out: Record<string, unknown> = {};
  const jobs: [string, () => Promise<unknown>][] = [["launch", () => runLaunchJobs()], ["queue", () => queueCleanup()], ["emails", () => runEmailJobs()], ["reminders", () => runReminders()], ["emaillog", () => pruneEmailLog()]];
  for (const [name, job] of jobs) {
    try { out[name] = await job(); } catch (e) { console.error("cron", name, e); out[name] = "erro"; }
  }
  return out;
}
