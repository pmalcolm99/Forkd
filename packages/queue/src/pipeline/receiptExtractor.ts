import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { db as dbType } from "@forkd/db";
import { getDecryptedConfigValue } from "@forkd/db";
import { expandItemQuantity, logger, moneyStringToCents } from "@forkd/shared";

/**
 * Receipt OCR + structured extraction via Claude vision.
 *
 * Lives in the queue package rather than @forkd/api because only the worker
 * ever calls it — the tRPC router just enqueues a job. That keeps the Anthropic
 * SDK out of the request path and avoids the api↔queue dependency cycle that
 * `confirmer.ts` had to work around.
 *
 * Throws on failure (worker-package convention, same as extractorAi.ts); the
 * worker catches, records the message on the split's `ai_error`, and the UI
 * shows it.
 */

/** Money arrives as a decimal string and is converted with integer math. */
const moneyString = z
  .string()
  .trim()
  .refine((s) => moneyStringToCents(s) !== null, {
    message: "Expected a decimal amount like 12.99",
  });

const optionalMoney = moneyString.nullish();

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullish(),
  // ISO date. Anything unparseable is dropped rather than guessed at.
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .default("USD"),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        quantity: z.number().positive().max(1000).default(1),
        unitPrice: optionalMoney,
        total: moneyString,
      })
    )
    .max(200),
  subtotal: optionalMoney,
  tax: optionalMoney,
  tip: optionalMoney,
  serviceCharge: optionalMoney,
  discount: optionalMoney,
  total: optionalMoney,
  /**
   * True when the tax shown is already inside the item prices — VAT, MwSt, IVA,
   * BTW, TVA, GST. Ubiquitous outside the US.
   */
  taxIncludedInSubtotal: z.boolean().default(false),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

/** Extraction converted into the integer cents the rest of the app speaks. */
export interface ReceiptExtractionCents {
  merchantName: string | null;
  purchasedAt: Date | null;
  currency: string;
  items: { label: string; quantity: number; unitPriceCents: number | null; totalCents: number }[];
  subtotalCents: number;
  taxIncluded: boolean;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  totalCents: number;
  confidence: "high" | "medium" | "low";
}

export interface ReceiptImageInput {
  /** "image/webp", "image/jpeg", … */
  mediaType: "image/webp" | "image/jpeg" | "image/png" | "image/gif";
  /** Raw base64, no data: prefix. */
  base64: string;
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

const PROMPT = `You are reading a restaurant receipt so a family can split the bill.

Return ONLY a JSON object with exactly these fields:
- "merchantName": the restaurant name printed on the receipt, or null
- "purchasedAt": the date on the receipt as "YYYY-MM-DD", or null if not printed
- "currency": the 3-letter ISO 4217 code for the amounts on this receipt (e.g. "USD", "EUR", "GBP", "JPY"). Infer it from the currency symbol, the language, or the address. Default to "USD" only if there is genuinely no signal.
- "items": an array of the ordered line items, in the order they appear. Each item is:
    - "label": the item name as printed (string)
    - "quantity": how many, as a number (default 1)
    - "unitPrice": price per unit as a decimal string like "12.99", or null if only a line total is shown
    - "total": the line total as a decimal string like "25.98"
- "subtotal", "tax", "tip", "serviceCharge", "discount", "total": decimal strings like "12.99", or null when that line does not appear on the receipt
- "taxIncludedInSubtotal": boolean — see the tax rules below. This matters enormously; get it right.
- "confidence": "high", "medium", or "low" — how confident you are in the line items overall

Tax — read this carefully, it is the most commonly mis-read part of a receipt:
- Outside the United States, tax is almost always ALREADY INCLUDED in the printed item prices. A receipt showing "MWSt", "MwSt.", "USt", "VAT", "IVA", "BTW", "TVA", "GST", "moms", or a "Satz / Netto / Steuer / Summe" breakdown table is telling you how much tax was *inside* the total — it is not an amount to add on. In that case set "taxIncludedInSubtotal": true and still report the tax figure in "tax".
- In the United States, sales tax is normally ADDED to the subtotal: subtotal + tax + tip = total. Set "taxIncludedInSubtotal": false.
- The arithmetic is the tiebreaker. If subtotal + tax + tip equals the printed total, tax is additional (false). If subtotal + tip alone equals the printed total, the tax was already included (true).
- A VAT breakdown table with several rates (e.g. "EUR 10 ... / EUR 20 ...") is always an inclusive breakdown. Report the sum of the tax column in "tax" and set the flag true.

Rules:
- All money values are plain decimal strings with no currency symbol and no thousands separators. Use a period as the decimal separator. Do NOT return numbers.
- "discount" is a positive number representing the amount taken off.
- Do not invent lines that are not on the receipt. Use null instead.
- Do not include subtotal, tax, tip, service charge, or the grand total as entries in "items".
- If a line item shows a quantity, set "quantity" to that number. Many receipts print BOTH a unit price and a line total (e.g. "3xWiener v.Kalb   26,90   80,70" means quantity 3, unitPrice "26.90", total "80.70") — when both columns are present, the larger is the line total and the smaller the unit price. If only one price is shown, put it in "total" and leave "unitPrice" null.
- "total" is always the amount for the whole line, never the per-unit price.
- Some receipts print zero-priced modifiers or comments under an item. Fold those into the item's label or skip them; never create a 0.00 item unless it is genuinely an ordered item.

Privacy — this is important:
- NEVER transcribe or return a card number, the last four digits of a card, an authorization or approval code, a cardholder name, or a signature line. Ignore them entirely. They must not appear anywhere in your output, including inside item labels.

Return the JSON object only. No markdown fences, no preamble, no explanation.`;

/**
 * Send one or two receipt photos to Claude and get back structured line items.
 */
export async function extractReceipt(
  images: ReceiptImageInput[],
  db: typeof dbType
): Promise<ReceiptExtractionCents> {
  if (images.length === 0) throw new Error("No receipt images to read");

  const apiKey = await getDecryptedConfigValue("ai.claude.api_key", db);
  if (!apiKey) throw new Error("Claude not configured: ai.claude.api_key is not set");

  const cfgModel = await getDecryptedConfigValue("ai.claude.model", db);
  const model = cfgModel ?? "claude-opus-5";
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS ?? "300000", 10);

  const client = new Anthropic({ apiKey });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model,
        // Thinking counts against max_tokens on current models, so this needs
        // real headroom — a tight budget truncates the JSON mid-object.
        // Deliberately no `temperature`: current Opus models reject non-default
        // sampling parameters with a 400.
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              ...images.map(
                (img) =>
                  ({
                    type: "image",
                    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
                  }) as const
              ),
              { type: "text", text: PROMPT },
            ],
          },
        ],
      },
      { signal: ac.signal }
    );
  } finally {
    clearTimeout(timer);
  }

  // Find the first text block rather than indexing content[0]: models with
  // thinking enabled put a thinking block first.
  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    logger.warn(
      { event: "receipt_no_text_block", blocks: message.content.map((b) => b.type) },
      "Claude returned no text block for receipt extraction"
    );
    throw new Error("Claude returned no readable response for this receipt");
  }

  let parsed: ReturnType<typeof receiptExtractionSchema.safeParse>;
  try {
    parsed = receiptExtractionSchema.safeParse(JSON.parse(stripFences(textBlock.text)));
  } catch {
    logger.warn(
      { event: "receipt_json_parse_error", raw: textBlock.text.slice(0, 2000) },
      "Failed to parse Claude receipt response as JSON"
    );
    throw new Error("Could not read the receipt — Claude's response was not valid JSON");
  }

  if (!parsed.success) {
    logger.warn(
      { event: "receipt_schema_error", issues: parsed.error.issues },
      "Claude receipt response failed schema validation"
    );
    throw new Error(
      `Claude's receipt response was missing or malformed: ${parsed.error.issues
        .slice(0, 5)
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }

  return toCents(parsed.data);
}

/** Convert a validated extraction into integer cents. Exported for testing. */
export function toCents(x: ReceiptExtraction): ReceiptExtractionCents {
  const money = (s: string | null | undefined): number => {
    if (s == null) return 0;
    return moneyStringToCents(s) ?? 0;
  };

  const items = x.items.map((it) => ({
    label: it.label.trim(),
    quantity: it.quantity,
    unitPriceCents: it.unitPrice == null ? null : (moneyStringToCents(it.unitPrice) ?? null),
    totalCents: money(it.total),
  }));

  const itemsSum = items.reduce((acc, it) => acc + it.totalCents, 0);

  let purchasedAt: Date | null = null;
  if (x.purchasedAt) {
    const d = new Date(`${x.purchasedAt}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) purchasedAt = d;
  }

  const subtotalCents = x.subtotal != null ? money(x.subtotal) : itemsSum;
  const taxCents = money(x.tax);
  const tipCents = money(x.tip);
  const serviceCents = money(x.serviceCharge);
  const discountCents = Math.abs(money(x.discount));

  // Trust the receipt's own arithmetic over the model's flag.
  //
  // Whether tax is inclusive is the single most consequential thing to get
  // wrong — it silently overcharges everyone by the tax amount — and it is
  // decidable from the numbers alone whenever a printed total exists. So we
  // check both readings against that total and let it settle the question;
  // the model's flag only stands in when the arithmetic is inconclusive.
  let taxIncluded = x.taxIncludedInSubtotal;
  if (x.total != null && taxCents > 0) {
    const printed = money(x.total);
    const withTax = subtotalCents + taxCents + tipCents + serviceCents - discountCents;
    const withoutTax = subtotalCents + tipCents + serviceCents - discountCents;
    // One-cent tolerance absorbs the rounding some tills apply.
    if (Math.abs(withoutTax - printed) <= 1 && Math.abs(withTax - printed) > 1) {
      taxIncluded = true;
    } else if (Math.abs(withTax - printed) <= 1 && Math.abs(withoutTax - printed) > 1) {
      taxIncluded = false;
    }
  }

  // Fall back to the computed total when the receipt has no grand-total line.
  const totalCents =
    x.total != null
      ? money(x.total)
      : subtotalCents + (taxIncluded ? 0 : taxCents) + tipCents + serviceCents - discountCents;

  return {
    merchantName: x.merchantName?.trim() || null,
    purchasedAt,
    currency: x.currency.toUpperCase(),
    items: items.flatMap((it) =>
      // "3x Schnitzel 80.70" becomes three individually claimable rows, so one
      // person isn't forced to take all three (or everyone to share equally).
      expandItemQuantity(it)
    ),
    subtotalCents,
    taxIncluded,
    taxCents,
    tipCents,
    serviceCents,
    discountCents,
    totalCents,
    confidence: x.confidence,
  };
}
