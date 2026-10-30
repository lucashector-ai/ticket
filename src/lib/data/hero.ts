import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { heroSlides } = schema;

/** Banners livres ligados do carrossel da home (não são eventos), na ordem da central. */
export async function listHeroSlides() {
  return db.select().from(heroSlides).where(eq(heroSlides.active, true)).orderBy(asc(heroSlides.position), asc(heroSlides.createdAt));
}
