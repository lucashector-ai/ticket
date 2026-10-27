"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { canEditArtist } from "@/lib/spotify-artists";

/** "Sobre" escrito pelo produtor: vale mais que o texto da Wikipédia. Vazio volta a usar a Wikipédia. */
export async function updateArtistBio(artistId: string, bio: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  if (!(await canEditArtist(user.id, artistId))) return { ok: false, error: "Só quem tem evento com este artista pode editar." };
  const text = bio.trim().slice(0, 4000);
  const [a] = await db.update(schema.artists).set({ bio: text || null }).where(eq(schema.artists.id, artistId)).returning({ slug: schema.artists.slug });
  if (a) revalidatePath(`/artistas/${a.slug}`);
  return { ok: true };
}
