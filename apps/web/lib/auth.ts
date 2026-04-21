import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@vouchr/db";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const auth = betterAuth({
  appName: "Vouchr.it",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true
    })
  ],
  user: {
    additionalFields: {
      mobileNumber: {
        type: "string",
        required: false,
        input: true
      }
    }
  }
});
