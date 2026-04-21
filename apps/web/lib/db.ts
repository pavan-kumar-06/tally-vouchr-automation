import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@vouchr/db";
import { getEnv } from "@/lib/env";

const globalForDb = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

function getDatabase() {
  const env = getEnv();
  const dbUrl = env.DATABASE_URL || "./vouchr-local.db";

  // libsql client requires file: prefix for local paths
  const normalizedUrl = dbUrl.startsWith("./") || dbUrl.startsWith("../")
    ? `file:${dbUrl}`
    : dbUrl;

  // Production: use D1 if DATABASE_URL is a libsql:// or cloudflare URL
  if (normalizedUrl.startsWith("libsql://")) {
    console.log("☁️  PRODUCTION: Using D1 database");
    const client = createClient({
      url: normalizedUrl,
      authToken: env.CLOUDFLARE_API_TOKEN,
    });
    return drizzle(client, { schema });
  }

  // Local dev (or build time)
  console.log("🏡 LOCAL MODE: Using local SQLite");
  const client = createClient({ url: normalizedUrl });
  return drizzle(client, { schema });
}

export const db = globalForDb.db ?? getDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
