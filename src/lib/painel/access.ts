import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope, type PainelRole } from "@/lib/data/painel";

const RANK: Record<PainelRole, number> = { portaria: 0, admin: 1, owner: 2 };

/** Usuário logado + produtor/papel/eventos, exigindo um papel mínimo (a portaria só entra no check-in). */
export async function painelAccess(need: PainelRole = "admin") {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/painel");
  const scope = await getPainelScope(user);
  if (RANK[scope.role] < RANK[need]) redirect(scope.role === "portaria" ? "/painel/equipe" : "/painel");
  return { user, ...scope };
}
