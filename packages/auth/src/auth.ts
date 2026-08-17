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
    // Disabled: identity comes entirely from Cloudflare Access in production.
    // Local dev uses /dev/select-user instead.
    enabled: false,
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
      homeState: {
        type: "string" as const,
        required: false,
        fieldName: "homeState",
        input: false,
      },
      theme: {
        type: "string" as const,
        required: false,
        fieldName: "theme",
        input: false,
      },
      mapDefaultView: {
        type: "string" as const,
        required: false,
        fieldName: "mapDefaultView",
        input: false,
      },
      // Payment handles, surfaced on a bill's share page when this person
      // fronted the money. fieldName is the camelCase Drizzle property, not
      // the snake_case column.
      venmoHandle: {
        type: "string" as const,
        required: false,
        fieldName: "venmoHandle",
        input: false,
      },
      cashAppHandle: {
        type: "string" as const,
        required: false,
        fieldName: "cashAppHandle",
        input: false,
      },
      paymentNote: {
        type: "string" as const,
        required: false,
        fieldName: "paymentNote",
        input: false,
      },
      defaultFilters: {
        type: "string" as const,
        required: false,
        fieldName: "defaultFilters",
        input: false,
      },
      lastSeenChangelogVersion: {
        type: "string" as const,
        required: false,
        fieldName: "lastSeenChangelogVersion",
        input: false,
      },
      lastActiveAt: {
        type: "date" as const,
        required: false,
        fieldName: "lastActiveAt",
        input: false,
      },
    },
  },
  secret: process.env.MASTER_KEY,
  baseURL: process.env.AUTH_URL,
  advanced: {
    cookiePrefix: "forkd",
    // Disable the __Secure- cookie name prefix. Better Auth derives this from AUTH_URL
    // starting with https://, but that causes a name mismatch with the cookies our
    // cloudflare-sync route sets (forkd.session_token). The Secure *attribute* (HTTPS-only
    // transmission) is enforced separately via defaultCookieAttributes below.
    useSecureCookies: false,
    defaultCookieAttributes: {
      secure: (process.env.AUTH_URL ?? "").startsWith("https://"),
    },
  },
});
