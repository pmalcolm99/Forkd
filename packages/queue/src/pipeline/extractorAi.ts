import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { db as dbType } from "@forkd/db";
import { getDecryptedConfigValue, usStateEnum } from "@forkd/db";
import { logger } from "@forkd/shared";

export const extractionSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  // ISO 3166-1 alpha-2 country code; defaults to US when Claude can't determine it.
  country: z.string().length(2).default("US"),
  // US state code, only when the restaurant is in the US. Optional/nullable otherwise.
  state: z.enum(usStateEnum.enumValues).nullish(),
  cuisine: z.string(),
  description: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export async function extractRestaurantInfo(
  postText: string,
  transcript: string,
  db: typeof dbType
): Promise<ExtractionResult> {
  const apiKey = await getDecryptedConfigValue("ai.claude.api_key", db);
  if (!apiKey) throw new Error("Claude not configured: ai.claude.api_key is not set");

  const cfgModel = await getDecryptedConfigValue("ai.claude.model", db);
  const model = cfgModel ?? "claude-opus-4-7";

  const prompt = `You are extracting restaurant information from a social media post about food.

Post text:
${postText}

Audio transcript:
${transcript || "(no transcript available)"}

Return ONLY a JSON object with exactly these fields:
- "name": restaurant name (required, non-empty string)
- "address": street address or neighborhood/area (empty string if unknown)
- "country": 2-letter ISO 3166-1 country code like "US", "JP", "FR" (infer from context; default to "US" if genuinely unclear)
- "state": 2-letter US state code like "TX" or "NY" — ONLY when country is "US" (infer from context). Use null for non-US restaurants or if unknown
- "cuisine": cuisine category inferred from the content — infer aggressively from food keywords (sushi/omakase/ramen/miso → "Japanese", tacos/enchiladas/birria → "Mexican", pasta/pizza/risotto → "Italian", pho/banh mi → "Vietnamese", BBQ/brisket/ribs → "BBQ", burgers/fries → "American", etc.). Empty string only if the cuisine is genuinely impossible to determine
- "description": 1-2 sentence description of the restaurant (empty string if unknown)
- "confidence": "high", "medium", or "low" — your confidence in the extracted restaurant name

No markdown fences, no preamble, no explanation. JSON object only.`;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude returned unexpected content type during restaurant extraction");
  }

  let parsed: ReturnType<typeof extractionSchema.safeParse>;
  try {
    parsed = extractionSchema.safeParse(JSON.parse(stripFences(block.text)));
  } catch {
    logger.warn(
      { event: "extractor_json_parse_error", raw: block.text },
      "Failed to parse Claude extraction response as JSON"
    );
    throw new Error("Could not parse restaurant extraction response from Claude");
  }

  if (!parsed.success) {
    logger.warn(
      { event: "extractor_schema_error", issues: parsed.error.issues },
      "Claude extraction response failed schema validation"
    );
    throw new Error(
      `Claude response missing required fields: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`
    );
  }

  return parsed.data;
}
