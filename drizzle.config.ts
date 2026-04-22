import { defineConfig } from "drizzle-kit";

  export default defineConfig({
    schema: "./packages/db/src/schema/index.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
      url: process.env.DATABASE_URL ?? "file:./vouchr-local.db"
    }
  });
