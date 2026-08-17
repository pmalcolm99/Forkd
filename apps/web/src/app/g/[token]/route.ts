import { db } from "@forkd/db";
import { buildSplitView } from "@forkd/api/splits";
import { renderGuestMessage, renderGuestPage } from "@/lib/guestPageHtml";
import {
  clientIp,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

/**
 * The guest bill page — a complete, self-contained HTML document.
 *
 * A route handler rather than a Next page on purpose: a page would pull the
 * client bundle and stylesheet from /_next/static/, which would then also have
 * to be exposed publicly. Everything this page needs is inline, so the entire
 * public surface is the /g/ prefix.
 */
export const dynamic = "force-dynamic";

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never cache: the whole point is that a reload shows what everyone else
      // has picked since.
      "Cache-Control": "no-store, must-revalidate",
      // The security headers for this path (CSP, X-Robots-Tag, Referrer-Policy,
      // nosniff, frame options) are set in next.config.ts — config headers
      // replace anything a route handler sets, so defining them twice would be
      // misleading. Only Cache-Control lives here, because it is specific to
      // this response rather than to the path.
    },
  });
}

const GONE = () =>
  html(
    renderGuestMessage(
      "This link isn't active",
      "It may have expired, been turned off, or the bill may have been deleted. Ask whoever sent it for a fresh link."
    ),
    404
  );

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  const { token } = await params;
  const resolved = await resolveGuestToken(token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? GONE() : tooManyRequests();
  }

  const view = await buildSplitView(db, resolved.ctx.splitId, { redact: true });
  if (!view) return GONE();

  const url = new URL(req.url);
  const flashParam = url.searchParams.get("saved");
  const flash =
    flashParam === "1"
      ? "saved"
      : flashParam === "paid"
        ? "paid"
        : flashParam === "unpaid"
          ? "unpaid"
          : null;

  return html(
    renderGuestPage({
      token,
      title: view.title,
      merchantName: view.merchantName,
      restaurantName: view.restaurant?.name ?? null,
      purchasedAt: view.purchasedAt,
      currency: view.currency,
      homeCurrency: view.homeCurrency,
      effectiveFxRate: view.effectiveFxRate,
      totalCents: view.totalCents,
      paidByParticipantId: view.paidByParticipantId,
      items: view.items,
      participants: view.participants,
      math: view.math,
      myParticipantId: resolved.ctx.participantId,
      myDisplayName: resolved.ctx.displayName,
      hasVisibleImages: view.images.length > 0,
      imageIds: view.images.map((i) => i.id),
      flash,
    })
  );
}
