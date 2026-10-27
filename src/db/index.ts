import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof createDb>;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  // Driver HTTP do Neon: sem conexões persistentes, ideal para Workers.
  return drizzle(neon(url), { schema, casing: "snake_case" });
}

let instance: DrizzleDb | undefined;

/** Conexão criada só no primeiro uso, para o build não depender do DATABASE_URL. */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
export type Db = DrizzleDb;
export { schema };
