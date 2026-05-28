import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { db as dbType } from "@forkd/db";
import { logger } from "@forkd/shared";
import { getDecryptedConfigValue } from "../config/read";

export type AiMetadataInput = {
  name: string;
  address?: string | null;
  website?: string | null;
};

export type AiMetadataResult =
  | { status: "success"; cuisine: string; description: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

const metadataSchema = z.object({
  cuisine: z.string().min(1),
  description: z.string().min(1),
});

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export async function suggestRestaurantMetadata(
  input: AiMetadataInput,
  db: typeof dbType
): Promise<AiMetadataResult> {
  const apiKey = await getDecryptedConfigValue("ai.claude.api_key", db);
  if (!apiKey) return { status: "not_configured" };

  const model = (await getDecryptedConfigValue("ai.claude.model", db)) ?? "claude-opus-4-7";
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS ?? "4000", 10);
  const temperature = parseFloat(process.env.AI_TEMPERATURE ?? "1.0");
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS ?? "300000", 10);

  const contextParts = [`Name: ${input.name}`];
  if (input.address) contextParts.push(`Address: ${input.address}`);
  if (input.website) contextParts.push(`Website: ${input.website}`);

  const prompt = `You are helping categorize a restaurant for a family restaurant tracker.
Given the following restaurant information, return ONLY a JSON object with exactly two fields:
- "cuisine": a single cuisine type string (e.g. "Mexican", "Italian", "American", "Chinese")
- "description": 1-2 sentences describing the restaurant

Restaurant information:
${contextParts.join("\n")}

Return only the JSON object. No markdown fences, no preamble, no explanation.`;

  const client = new Anthropic({ apiKey });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: ac.signal }
    );
    clearTimeout(timer);

    const block = message.content[0];
    if (!block || block.type !== "text") {
      logger.warn({ event: "ai_unexpected_content_type" }, "Claude returned non-text content");
      return { status: "failed", error: "Unexpected response format" };
    }

    const raw = stripFences(block.text);

    let parsed: ReturnType<typeof metadataSchema.safeParse>;
    try {
      parsed = metadataSchema.safeParse(JSON.parse(raw));
    } catch {
      logger.warn({ event: "ai_json_parse_error", raw }, "Failed to parse Claude JSON response");
      return { status: "failed", error: "Could not parse response" };
    }

    if (!parsed.success) {
      logger.warn(
        { event: "ai_schema_validation_error", issues: parsed.error.issues },
        "Claude response failed schema validation"
      );
      return { status: "failed", error: "Response missing required fields" };
    }

    return {
      status: "success",
      cuisine: parsed.data.cuisine,
      description: parsed.data.description,
    };
  } catch (err) {
    clearTimeout(timer);
    logger.error({ event: "ai_request_failed", err }, "Claude API request failed");
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}
