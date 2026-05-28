import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@forkd/shared", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

const mockGetDecryptedConfigValue = vi.fn();

vi.mock("../config/read", () => ({
  getDecryptedConfigValue: (...args: unknown[]) => mockGetDecryptedConfigValue(...args),
}));

function makeTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function setupConfigValues(apiKey: string | null, model = "claude-opus-4-7") {
  mockGetDecryptedConfigValue.mockImplementation((key: string) => {
    if (key === "ai.claude.api_key") return Promise.resolve(apiKey);
    if (key === "ai.claude.model") return Promise.resolve(model);
    return Promise.resolve(null);
  });
}

describe("suggestRestaurantMetadata", () => {
  it("returns not_configured when API key is absent", async () => {
    setupConfigValues(null);
    const { suggestRestaurantMetadata } = await import("./anthropic");
    const result = await suggestRestaurantMetadata({ name: "Test Cafe" }, {} as never);
    expect(result).toEqual({ status: "not_configured" });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("returns success with valid JSON response", async () => {
    setupConfigValues("sk-test-key");
    mockMessagesCreate.mockResolvedValueOnce(
      makeTextResponse('{"cuisine":"Mexican","description":"A great taco place."}')
    );
    const { suggestRestaurantMetadata } = await import("./anthropic");
    const result = await suggestRestaurantMetadata(
      { name: "Casa Bonita", address: "Lakewood, CO" },
      {} as never
    );
    expect(result).toEqual({
      status: "success",
      cuisine: "Mexican",
      description: "A great taco place.",
    });
  });

  it("strips markdown fences and succeeds", async () => {
    setupConfigValues("sk-test-key");
    mockMessagesCreate.mockResolvedValueOnce(
      makeTextResponse(
        '```json\n{"cuisine":"Italian","description":"Authentic pasta dishes."}\n```'
      )
    );
    const { suggestRestaurantMetadata } = await import("./anthropic");
    const result = await suggestRestaurantMetadata({ name: "Trattoria Roma" }, {} as never);
    expect(result).toEqual({
      status: "success",
      cuisine: "Italian",
      description: "Authentic pasta dishes.",
    });
  });

  it("returns failed when response is not parseable JSON", async () => {
    setupConfigValues("sk-test-key");
    mockMessagesCreate.mockResolvedValueOnce(makeTextResponse("Sorry, I cannot help with that."));
    const { suggestRestaurantMetadata } = await import("./anthropic");
    const { logger } = await import("@forkd/shared");
    (logger.warn as Mock).mockClear();
    const result = await suggestRestaurantMetadata({ name: "Unknown Place" }, {} as never);
    expect(result.status).toBe("failed");
    expect(logger.warn).toHaveBeenCalled();
  });

  it("returns failed when SDK throws", async () => {
    setupConfigValues("sk-test-key");
    mockMessagesCreate.mockRejectedValueOnce(new Error("Network error"));
    const { suggestRestaurantMetadata } = await import("./anthropic");
    const { logger } = await import("@forkd/shared");
    (logger.error as Mock).mockClear();
    const result = await suggestRestaurantMetadata({ name: "Broken Cafe" }, {} as never);
    expect(result).toEqual({ status: "failed", error: "Network error" });
    expect(logger.error).toHaveBeenCalled();
  });
});
