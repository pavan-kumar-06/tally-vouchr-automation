import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@vouchr/db";
import { getEnv } from "@/lib/env";

type D1ApiResult = {
  success: boolean;
  result?: Array<{
    success: boolean;
    results?: Array<Record<string, unknown>> | { columns?: string[]; rows?: unknown[][] };
    meta?: Record<string, unknown>;
  }>;
  errors?: Array<{ code?: number; message?: string }>;
};

const globalForDb = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

function getD1Endpoint(path: "query" | "raw") {
  const env = getEnv();
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_DATABASE_ID) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_DATABASE_ID");
  }

  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_DATABASE_ID}/${path}`;
}

async function executeD1Sql(
  sql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get"
): Promise<{ rows: any[] }> {
  const env = getEnv();

  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Missing CLOUDFLARE_API_TOKEN");
  }

  const endpoint = getD1Endpoint(method === "values" ? "raw" : "query");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`
    },
    body: JSON.stringify({
      sql,
      params
    }),
    cache: "no-store"
  });

  const payload = (await response.json()) as D1ApiResult;

  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? `D1 query failed with status ${response.status}`;
    throw new Error(message);
  }

  const first = payload.result?.[0];
  if (!first?.success) {
    throw new Error("D1 returned unsuccessful result");
  }

  if (method === "values") {
    const rows = (first.results as { rows?: any[][] } | undefined)?.rows ?? [];
    return { rows };
  }

  const rows = (first.results as Array<Record<string, unknown>> | undefined) ?? [];

  if (method === "get") {
    // drizzle sqlite-proxy `get()` expects a single row at runtime.
    return { rows: (rows[0] as unknown as any[]) ?? ([] as any[]) };
  }

  return { rows: rows as any[] };
}

function getDatabase() {
  const env = getEnv();

  const hasD1Config = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_DATABASE_ID && env.CLOUDFLARE_API_TOKEN);

  if (hasD1Config) {
    console.log("☁️  CLOUD MODE: Using Cloudflare D1 via HTTP API");

    return drizzle(
      async (sql, params, method) => executeD1Sql(sql, params, method),
      async (batch) => {
        const results: Array<{ rows: any[] }> = [];
        for (const query of batch) {
          results.push(await executeD1Sql(query.sql, query.params, query.method));
        }
        return results;
      },
      { schema }
    );
  }

  throw new Error(
    "Cloudflare D1 credentials missing. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN."
  );
}

export const db = globalForDb.db ?? getDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
