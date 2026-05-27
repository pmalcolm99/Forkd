import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { createCallerFactory, appRouter } from "@forkd/api";
import { db, session as sessionTable, user as userTable } from "@forkd/db";
import { makeSignature } from "@forkd/auth";

const createCaller = createCallerFactory(appRouter);

// Bypass auth.api.getSession (which requires a full HTTP request context) and
// look up the session directly from the DB. This is the same logic Better Auth
// uses internally: verify the HMAC-signed cookie, then join session + user.
async function resolveSessionFromCookie() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("forkd.session_token");
  if (!tokenCookie?.value) return null;

  // URL-decode: ResponseCookies.set() encodes values with encodeURIComponent (e.g. "=" → "%3D").
  // Defensively decode here so the HMAC comparison works regardless of whether the
  // App Router's cookies() already decoded the value or not.
  let raw = tokenCookie.value;
  try {
    if (raw.includes("%")) raw = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const rawToken = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = await makeSignature(rawToken, process.env.MASTER_KEY!);
  if (sig !== expected) return null;

  const rows = await db
    .select()
    .from(sessionTable)
    .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
    .where(and(eq(sessionTable.token, rawToken), gt(sessionTable.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { session: row.session, user: row.user };
}

export const serverTrpc = async () => {
  const data = await resolveSessionFromCookie();
  return createCaller({
    db,
    // Drizzle row types are structurally compatible with Better Auth's session/user
    // shapes at runtime but don't satisfy the inferred generic — cast required.
    session: (data?.session ?? null) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    user: (data?.user ?? null) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    fileStore: null,
    shutdownFn: null,
  });
};
