import { drizzle } from "drizzle-orm/better-sqlite3"; 
import Database from "better-sqlite3";
import * as schema from "@vouchr/db";
import { getEnv } from "@/lib/env";

const globalForDb = globalThis as unknown as {
  db: any | undefined;
};

function getDatabase() {
  const env = getEnv();
  console.log("🏡 LOCAL MODE: Using vouchr-local.db");
  const sqlite = new Database("./vouchr-local.db");
  
  // Enable foreign keys and WAL mode for better performance
  sqlite.pragma('journal_mode = WAL');
  
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.db ?? getDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
