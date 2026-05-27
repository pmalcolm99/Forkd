import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db, session, user } from "@forkd/db";
import { makeSignature } from "@forkd/auth";
import { logger } from "@forkd/shared";

async function deleteSessionFromCookie(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;

  let decoded = cookieValue;
  try {
    if (decoded.includes("%")) decoded = decodeURIComponent(decoded);
  } catch {
    /* already decoded */
  }

  const dot = decoded.lastIndexOf(".");
  if (dot < 1) return;

  const rawToken = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = await makeSignature(rawToken, process.env.MASTER_KEY!);
  if (sig !== expected) return;

  const rows = await db
    .select({ sessionId: session.id, userId: session.userId })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, rawToken), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return;

  await db.delete(session).where(eq(session.id, row.sessionId));
  logger.info({ userId: row.userId, event: "sign_out" }, "Session deleted");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieValue = req.cookies.get("forkd.session_token")?.value;
  try {
    await deleteSessionFromCookie(cookieValue);
  } catch (err) {
    logger.error({ err }, "Error deleting session during sign-out");
  }

  const destination =
    process.env.CF_ACCESS_ENABLED === "true" && process.env.CF_ACCESS_TEAM_DOMAIN
      ? `https://${process.env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout`
      : "/sign-in";

  const response = NextResponse.redirect(new URL(destination, req.url));
  response.cookies.set("forkd.session_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
