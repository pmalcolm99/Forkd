import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, user, account, session, verification } from "@forkd/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      account,
      session,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      firstName: {
        type: "string" as const,
        required: false,
        fieldName: "firstName",
      },
      lastName: {
        type: "string" as const,
        required: false,
        fieldName: "lastName",
      },
      isAdmin: {
        type: "boolean" as const,
        required: false,
        fieldName: "isAdmin",
        defaultValue: false,
        input: false,
      },
      isOwner: {
        type: "boolean" as const,
        required: false,
        fieldName: "isOwner",
        defaultValue: false,
        input: false,
      },
    },
  },
  secret: process.env.MASTER_KEY,
  baseURL: process.env.AUTH_URL,
  advanced: {
    cookiePrefix: "forkd",
  },
});
