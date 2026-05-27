import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db, session, user } from "@forkd/db";
import { makeSignature } from "@forkd/auth";
import { logger } from "@forkd/shared";
import { verifyCloudflareAccessJwt } from "@/lib/cloudflareAccess";
import { provisionSessionForIdentity } from "@/lib/sessionProvisioning";

// Direct DB session lookup — mirrors the logic in serverTrpc. We cannot rely on
// auth.api.getSession here because it requires a full HTTP request context, and
// its internal cookie-parsing path can silently fail when headers are forwarded
// through proxy layers. Using Drizzle directly is more reliable.
async function lookupExistingSession(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  // Defensively URL-decode: ResponseCookies.set() encodes with encodeURIComponent.
  let decoded = cookieValue;
  try {
    if (decoded.includes("%")) decoded = decodeURIComponent(decoded);
  } catch {
    /* already decoded */
  }
  const dot = decoded.lastIndexOf(".");
  if (dot < 1) return null;
  const rawToken = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = await makeSignature(rawToken, process.env.MASTER_KEY!);
  if (sig !== expected) return null;
  const rows = await db
    .select()
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, rawToken), gt(session.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { session: row.session, user: row.user };
}

function metaRefreshResponse(destination: URL): NextResponse {
  const destHtmlSafe = destination.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new NextResponse(
    `<!DOCTYPE html><html><head>` +
      `<meta http-equiv="refresh" content="0;url=${destHtmlSafe}">` +
      `<meta name="robots" content="noindex">` +
      `</head><body></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.CF_ACCESS_ENABLED !== "true") {
    return NextResponse.json({ error: "CF Access not enabled" }, { status: 400 });
  }

  // Re-verify the CF JWT (middleware already checked, but this route is the last line
  // of defence — never trust that it was only reached via middleware).
  const cfJwt = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!cfJwt) {
    return new NextResponse("Missing Cloudflare Access JWT", { status: 403 });
  }
  const identity = await verifyCloudflareAccessJwt(cfJwt);
  if (!identity) {
    return new NextResponse("Invalid Cloudflare Access JWT", { status: 403 });
  }

  // Validate returnTo is a relative path (open-redirect prevention).
  const raw = req.nextUrl.searchParams.get("returnTo") ?? "/";
  const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const destination = new URL(returnTo, process.env.AUTH_URL ?? req.url);

  // Log incoming cookie names (not values) so we can see if the browser is sending
  // forkd.session_token back on the second call.
  const incomingCookieNames =
    req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim().split("=")[0]?.trim())
      .filter(Boolean) ?? [];
  logger.info(
    { cookieNames: incomingCookieNames, email: identity.email },
    "CF Access: sync route reached"
  );

  // Idempotency: if the existing session belongs to the same CF identity, skip provisioning.
  // If it belongs to a different user (e.g. shared device), delete the stale row first.
  const rawCookieValue = req.cookies.get("forkd.session_token")?.value;
  const existingSession = await lookupExistingSession(rawCookieValue);
  const sessionEmail = existingSession?.user?.email?.toLowerCase();

  logger.info(
    {
      hasCookieValue: !!rawCookieValue,
      sessionFound: !!existingSession,
      sessionEmailMatch: sessionEmail === identity.email,
    },
    "CF Access: idempotency check"
  );

  if (sessionEmail === identity.email) {
    // Session already valid — no cookie change needed; return 200 meta-refresh so that
    // any CDN/proxy layer (including Cloudflare) cannot strip a Set-Cookie header.
    logger.info(
      { email: identity.email },
      "CF Access: idempotency hit — returning without Set-Cookie"
    );
    return metaRefreshResponse(destination);
  }

  if (existingSession?.session?.token) {
    // Stale session for a different user — remove it to avoid accumulation.
    await db.delete(session).where(eq(session.token, existingSession.session.token));
  }

  // Provision a new Better Auth session for the CF identity.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const signedToken = await provisionSessionForIdentity(
    identity,
    req.headers.get("user-agent"),
    ip
  );

  logger.info({ email: identity.email }, "CF Access: session provisioned via sync route");

  const isSecure = (process.env.AUTH_URL ?? "").startsWith("https://");

  // Return a 200 HTML page instead of a redirect so the Set-Cookie header survives.
  // Cloudflare (and many CDN proxies) drop Set-Cookie from 3xx responses; they never
  // drop it from 200 responses. The meta-refresh fires immediately; the browser sends
  // the newly set cookie on that follow-up GET, breaking the redirect loop.
  const response = metaRefreshResponse(destination);
  response.cookies.set("forkd.session_token", signedToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: isSecure,
  });
  return response;
}
