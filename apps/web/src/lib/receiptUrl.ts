/** Authenticated receipt image URL (Forkd users, behind Cloudflare Access). */
export function receiptUrl(splitId: string, imageId: string, kind: "full" | "thumb"): string {
  const suffix = kind === "thumb" ? "_thumb" : "";
  return `/api/v1/receipts/splits/${splitId}/${imageId}${suffix}.webp`;
}

/**
 * Receipt image URL for a guest link. Goes through the guest endpoint, which
 * sits outside Cloudflare Access and authorises on the token alone.
 */
export function guestReceiptUrl(
  splitId: string,
  imageId: string,
  kind: "full" | "thumb",
  token: string
): string {
  const suffix = kind === "thumb" ? "_thumb" : "";
  return `/api/v1/guest/image/splits/${splitId}/${imageId}${suffix}.webp?token=${encodeURIComponent(token)}`;
}
