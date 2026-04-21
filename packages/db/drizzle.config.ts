import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "./local.db";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl
  },
  strict: true,
  verbose: true
});
