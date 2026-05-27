export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, session } from "@forkd/db";

// Direct DB + cookie approach (no tRPC) — sign-out is a one-off that doesn't benefit
// from the tRPC layer, and skipping it avoids the protectedProcedure redirect loop.
export default async function SignOutPage() {
  try {
    const headerStore = await headers();
    const currentSession = await auth.api.getSession({ headers: headerStore });
    if (currentSession?.session?.token) {
      // session.token is the raw (unsigned) token that matches the DB session.token column.
      await db.delete(session).where(eq(session.token, currentSession.session.token));
    }
  } catch {
    // No session or DB unavailable — proceed to clear the cookie anyway.
  }

  const cookieStore = await cookies();
  cookieStore.delete("forkd.session_token");

  if (process.env.CF_ACCESS_ENABLED === "true" && process.env.CF_ACCESS_TEAM_DOMAIN) {
    // Must go through CF Access logout to revoke the CF token — otherwise Cloudflare
    // silently re-issues the JWT and the user appears to still be logged in.
    redirect(`https://${process.env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout`);
  }

  redirect("/sign-in");
}
