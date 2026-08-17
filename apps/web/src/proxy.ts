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
  // Guest bill-split links (/g/*) are deliberately outside the Cloudflare
  // Access gate — that is the whole point of them. The entire guest surface
  // lives under this one prefix, and every page it serves is a self-contained
  // HTML document with inline CSS and no JavaScript, so nothing from
  // /_next/static/ has to be exposed alongside it.
  //
  // They are inert unless the operator switches `receipts.guest_links_enabled`
  // on, and they authorise on a 32-byte capability token scoped to one
  // participant on one bill. See docs/cloudflare-access-setup.md.
  matcher: [
    // Protect all routes except:
    //   _next/  — all Next.js internals (static, image, HMR, etc.)
    //   favicon.ico, manifest(.json|.webmanifest), robots.txt — public metadata
    //   sw.js, offline.html, icon*.png / apple-icon*.png — PWA assets the browser
    //     must fetch without an app session (install, icon, offline shell)
    //   api/v1/health — Docker healthcheck (responds to both GET and HEAD)
    "/((?!_next/|favicon\\.ico|manifest\\.(?:json|webmanifest)|robots\\.txt|sw\\.js|offline\\.html|(?:apple-)?icon[\\w-]*\\.png|api/v1/health|g/).*)",
  ],
};
