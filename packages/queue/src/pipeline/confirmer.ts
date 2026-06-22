import { z } from "zod";
import type { db as dbType } from "@forkd/db";
import { getDecryptedConfigValue } from "@forkd/db";
import { logger } from "@forkd/shared";

export type ConfirmedPlace = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  photoName: string | null;
  countryCode: string | null;
  stateCode: string | null;
};

const addressComponentSchema = z.object({
  shortText: z.string(),
  longText: z.string(),
  types: z.array(z.string()),
});

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  rating: z.number().optional(),
  photos: z.array(z.object({ name: z.string() })).optional(),
  addressComponents: z.array(addressComponentSchema).optional(),
});

const searchResponseSchema = z.object({
  places: z.array(placeSchema).optional().default([]),
});

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const TIMEOUT_MS = 10_000;

export async function confirmWithGooglePlaces(
  query: string,
  db: typeof dbType
): Promise<ConfirmedPlace | null> {
  const apiKey = await getDecryptedConfigValue("google_places.api_key", db);
  if (!apiKey) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.photos,places.addressComponents",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(
        { event: "confirmer_places_error", status: resp.status },
        "Google Places search returned non-200 during import confirmation"
      );
      return null;
    }

    const raw = await resp.json();
    const parsed = searchResponseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.places.length === 0) return null;

    const p = parsed.data.places[0]!;
    const country = p.addressComponents?.find((c) => c.types.includes("country"));
    const admin1 = p.addressComponents?.find((c) =>
      c.types.includes("administrative_area_level_1")
    );
    const countryCode = country?.shortText ?? null;
    return {
      placeId: p.id,
      name: p.displayName.text,
      formattedAddress: p.formattedAddress,
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      rating: p.rating ?? null,
      photoName: p.photos?.[0]?.name ?? null,
      countryCode,
      stateCode: countryCode === "US" ? (admin1?.shortText ?? null) : null,
    };
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ event: "confirmer_places_failed", err }, "Google Places confirmation failed");
    return null;
  }
}
