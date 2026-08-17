/**
 * Receipt image encode settings — the single source of truth for every Sharp
 * call site that touches a receipt photo (upload handler and the AI worker).
 *
 * 1568px is deliberate: it is exactly the long-edge ceiling Claude's vision
 * pipeline downscales to internally, so storing at that size loses nothing on
 * the extraction path while keeping the in-app copy small. At quality 72 a
 * typical receipt lands around 120–200 KB — low, but comfortably readable when
 * you open it to check a line item.
 */
export const RECEIPT_FULL_MAX = 1568;
export const RECEIPT_FULL_QUALITY = 72;
export const RECEIPT_THUMB_SIZE = 320;
export const RECEIPT_THUMB_QUALITY = 70;
