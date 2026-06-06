import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@forkd/shared", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetDecryptedConfigValue = vi.fn();
vi.mock("../config/read", () => ({
  getDecryptedConfigValue: (...args: unknown[]) => mockGetDecryptedConfigValue(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeFetchResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("searchPlaces", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockGetDecryptedConfigValue.mockReset();
  });

  it("returns not_configured when API key is absent", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue(null);
    const { searchPlaces } = await import("./google-places");
    const result = await searchPlaces("pizza", {} as never);
    expect(result).toEqual({ status: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns success with valid API response", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(
      makeFetchResponse(200, {
        places: [
          {
            id: "ChIJtest",
            displayName: { text: "Casa Bonita" },
            formattedAddress: "6715 W Colfax Ave, Lakewood, CO 80214, USA",
            location: { latitude: 39.74, longitude: -105.09 },
            rating: 3.7,
            websiteUri: "https://casabonitadenver.com",
          },
        ],
      })
    );
    const { searchPlaces } = await import("./google-places");
    const result = await searchPlaces("Casa Bonita", {} as never);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      placeId: "ChIJtest",
      name: "Casa Bonita",
      formattedAddress: "6715 W Colfax Ave, Lakewood, CO 80214, USA",
      latitude: 39.74,
      longitude: -105.09,
      rating: 3.7,
      website: "https://casabonitadenver.com",
    });
  });

  it("returns failed on non-200 response", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(makeFetchResponse(403, {}));
    const { searchPlaces } = await import("./google-places");
    const result = await searchPlaces("pizza", {} as never);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("403");
  });

  it("returns failed when response body fails schema validation", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(
      makeFetchResponse(200, {
        places: [{ id: 123 }], // id should be string
      })
    );
    const { searchPlaces } = await import("./google-places");
    const result = await searchPlaces("pizza", {} as never);
    expect(result.status).toBe("failed");
  });
});

describe("getPlaceRating", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockGetDecryptedConfigValue.mockReset();
  });

  it("returns not_configured when API key is absent", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue(null);
    const { getPlaceRating } = await import("./google-places");
    const result = await getPlaceRating("ChIJtest", {} as never);
    expect(result).toEqual({ status: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns success with rating present", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(makeFetchResponse(200, { id: "ChIJtest", rating: 4.3 }));
    const { getPlaceRating } = await import("./google-places");
    const result = await getPlaceRating("ChIJtest", {} as never);
    expect(result).toEqual({ status: "success", rating: 4.3, latitude: null, longitude: null });
  });

  it("returns success with null rating when rating field is absent", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(makeFetchResponse(200, { id: "ChIJtest" }));
    const { getPlaceRating } = await import("./google-places");
    const result = await getPlaceRating("ChIJtest", {} as never);
    expect(result).toEqual({ status: "success", rating: null, latitude: null, longitude: null });
  });

  it("returns success with location when present", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(
      makeFetchResponse(200, {
        id: "ChIJtest",
        rating: 4.3,
        location: { latitude: 39.74, longitude: -105.09 },
      })
    );
    const { getPlaceRating } = await import("./google-places");
    const result = await getPlaceRating("ChIJtest", {} as never);
    expect(result).toEqual({ status: "success", rating: 4.3, latitude: 39.74, longitude: -105.09 });
  });

  it("returns failed on non-200 response", async () => {
    mockGetDecryptedConfigValue.mockResolvedValue("fake-key");
    mockFetch.mockReturnValueOnce(makeFetchResponse(404, {}));
    const { getPlaceRating } = await import("./google-places");
    const result = await getPlaceRating("ChIJtest", {} as never);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("404");
  });
});
