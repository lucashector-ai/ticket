import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return url;
}

// Driver HTTP do Neon: sem conexões persistentes, ideal para Workers.
export const db = drizzle(neon(databaseUrl()), { schema, casing: "snake_case" });
export type Db = typeof db;
export { schema };
