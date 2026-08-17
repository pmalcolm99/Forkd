/** Authenticated receipt image URL (Forkd users, behind Cloudflare Access). */
export function receiptUrl(splitId: string, imageId: string, kind: "full" | "thumb"): string {
  const suffix = kind === "thumb" ? "_thumb" : "";
  return `/api/v1/receipts/splits/${splitId}/${imageId}${suffix}.webp`;
}

// Guest receipt images are not built here. The guest page is served as a
// self-contained document from /g/<token>, and its images are addressed
// relative to that same prefix (/g/<token>/image/<id>) so the whole public
// surface stays under one path — see apps/web/src/lib/guestPageHtml.ts.
