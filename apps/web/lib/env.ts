import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-please-32chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("./vouchr-local.db"),
  R2_ACCOUNT_ID: z.string().min(1).default("local-account"),
  R2_ACCESS_KEY_ID: z.string().min(1).default("local-access-key"),
  R2_SECRET_ACCESS_KEY: z.string().min(1).default("local-secret-key"),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url().or(z.literal("")).optional(),
  WORKER_BASE_URL: z.string().url().default("http://localhost:8000"),
  CONNECTOR_SHARED_TOKEN: z.string().min(16).default("dev-connector-token-change-me"),
  WORKER_WEBHOOK_SECRET: z.string().min(16).default("dev-worker-secret-change-me"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:8000"),
  VOUCHR_WORKER_URL: z.string().url().default("http://localhost:8000").optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_DATABASE_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional()
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse({
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME ?? "vouchrit-data",
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    WORKER_BASE_URL: process.env.WORKER_BASE_URL,
    CONNECTOR_SHARED_TOKEN: process.env.CONNECTOR_SHARED_TOKEN,
    WORKER_WEBHOOK_SECRET: process.env.WORKER_WEBHOOK_SECRET,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_DATABASE_ID: process.env.CLOUDFLARE_DATABASE_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN
  });

  return cachedEnv;
}
