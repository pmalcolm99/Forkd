import { z } from "zod";
import type { db as dbType } from "@forkd/db";
import { logger } from "@forkd/shared";
import { getDecryptedConfigValue } from "../config/read";

export type SearchResult = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  website: string | null;
};

export type SearchPlacesResult =
  | { status: "success"; results: SearchResult[] }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

export type GetPlaceRatingResult =
  | { status: "success"; rating: number | null; latitude: number | null; longitude: number | null }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  rating: z.number().optional(),
  websiteUri: z.string().optional(),
});

const searchResponseSchema = z.object({
  places: z.array(placeSchema).optional().default([]),
});

const ratingResponseSchema = z.object({
  id: z.string(),
  rating: z.number().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_BASE = "https://places.googleapis.com/v1/places";
const TIMEOUT_MS = 10_000;

export async function searchPlaces(query: string, db: typeof dbType): Promise<SearchPlacesResult> {
  const apiKey = await getDecryptedConfigValue("google_places.api_key", db);
  if (!apiKey) return { status: "not_configured" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.websiteUri",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(
        { event: "google_places_search_error", status: resp.status },
        "Google Places text search returned non-200"
      );
      return { status: "failed", error: `API returned ${resp.status}` };
    }

    const raw = await resp.json();
    const parsed = searchResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn(
        { event: "google_places_search_parse_error", issues: parsed.error.issues },
        "Google Places search response failed schema validation"
      );
      return { status: "failed", error: "Could not parse response" };
    }

    const results: SearchResult[] = parsed.data.places.map((p) => ({
      placeId: p.id,
      name: p.displayName.text,
      formattedAddress: p.formattedAddress,
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      rating: p.rating ?? null,
      website: p.websiteUri ?? null,
    }));

    return { status: "success", results };
  } catch (err) {
    clearTimeout(timer);
    logger.error(
      { event: "google_places_search_failed", err },
      "Google Places search request failed"
    );
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function getPlaceRating(
  placeId: string,
  db: typeof dbType
): Promise<GetPlaceRatingResult> {
  const apiKey = await getDecryptedConfigValue("google_places.api_key", db);
  if (!apiKey) return { status: "not_configured" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${PLACE_DETAILS_BASE}/${placeId}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Place Details field mask has NO "places." prefix (unlike text search)
        "X-Goog-FieldMask": "id,rating,location",
      },
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(
        { event: "google_places_rating_error", status: resp.status, placeId },
        "Google Places details returned non-200"
      );
      return { status: "failed", error: `API returned ${resp.status}` };
    }

    const raw = await resp.json();
    const parsed = ratingResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn(
        { event: "google_places_rating_parse_error", issues: parsed.error.issues },
        "Google Places details response failed schema validation"
      );
      return { status: "failed", error: "Could not parse response" };
    }

    return {
      status: "success",
      rating: parsed.data.rating ?? null,
      latitude: parsed.data.location?.latitude ?? null,
      longitude: parsed.data.location?.longitude ?? null,
    };
  } catch (err) {
    clearTimeout(timer);
    logger.error(
      { event: "google_places_rating_failed", err },
      "Google Places details request failed"
    );
    return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
  }
}
