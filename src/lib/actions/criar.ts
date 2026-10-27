"use server";

import { getSessionUser } from "@/lib/auth/server";
import type { DbMap, Draft } from "@/lib/criar/model";
import { saveEventAs, type SaveEventResult } from "@/lib/criar/save";

export type { SaveEventResult };

/** Salva o evento do formulário de /criar-evento em nome de quem está logado. */
export async function saveEvent(input: { draft: Draft; eventId: string | null; dbMap: DbMap }): Promise<SaveEventResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre de novo para salvar o evento." };
  return saveEventAs(user, input);
}
