import { NextRequest, NextResponse } from "next/server";
import { verifyCloudflareAccessJwt } from "@/lib/cloudflareAccess";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // When CF_ACCESS_ENABLED is not "true" (local dev), bypass entirely.
  if (process.env.CF_ACCESS_ENABLED !== "true") return NextResponse.next();

  const cfJwt = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!cfJwt) {
    return new NextResponse("Access denied. This application requires Cloudflare Access.", {
      status: 403,
    });
  }

  const identity = await verifyCloudflareAccessJwt(cfJwt);
  if (!identity) {
    return new NextResponse("Access denied. Invalid Cloudflare Access token.", { status: 403 });
  }

  // Don't check for a session cookie on the sync route — it IS the session provisioning
  // endpoint. Checking here would create an infinite redirect loop.
  if (req.nextUrl.pathname === "/api/auth/cloudflare-sync") {
    return NextResponse.next();
  }

  // If the Better Auth session cookie is missing, send the user through the sync route
  // to provision one. The sync route re-verifies the CF JWT (defence in depth) and
  // returns with the cookie set and a redirect to the original destination.
  const sessionCookie = req.cookies.get("forkd.session_token");
  if (!sessionCookie?.value) {
    const raw = req.nextUrl.pathname + (req.nextUrl.search ?? "");
    // Validate returnTo is a relative path to prevent open-redirect attacks.
    const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
    const syncUrl = new URL("/api/auth/cloudflare-sync", process.env.AUTH_URL ?? req.url);
    syncUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(syncUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except:
    //   _next/  — all Next.js internals (static, image, HMR, etc.)
    //   favicon.ico, manifest.json, robots.txt — public files needed without auth
    //   api/v1/health — Docker healthcheck (responds to both GET and HEAD)
    "/((?!_next/|favicon\\.ico|manifest\\.json|robots\\.txt|api/v1/health).*)",
  ],
};
