import { afterEach, describe, expect, it, vi } from "vitest";

// Must mock these subpaths before any import of cloudflareAccess
vi.mock("jose/jwks/remote", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
}));
vi.mock("jose/jwt/verify", () => ({
  jwtVerify: vi.fn(),
}));

// Suppress console output during tests
const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleSpy.mockClear();
});

describe("verifyCloudflareAccessJwt", () => {
  it("returns null when CF_ACCESS_ENABLED is not 'true'", async () => {
    vi.stubEnv("CF_ACCESS_ENABLED", "false");
    const { verifyCloudflareAccessJwt } = await import("./cloudflareAccess");
    const { jwtVerify } = await import("jose/jwt/verify");

    const result = await verifyCloudflareAccessJwt("any-token");

    expect(result).toBeNull();
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it("returns identity with lowercased email for a valid JWT", async () => {
    vi.stubEnv("CF_ACCESS_ENABLED", "true");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "myteam.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "test-aud");

    const { jwtVerify } = await import("jose/jwt/verify");
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { email: "A@B.COM", name: "Pat Malcolm", sub: "sub1" },
      protectedHeader: { alg: "RS256" },
    } as never);

    const { verifyCloudflareAccessJwt } = await import("./cloudflareAccess");
    const result = await verifyCloudflareAccessJwt("valid-token");

    expect(result).toEqual({ email: "a@b.com", name: "Pat Malcolm", sub: "sub1" });
  });

  it("returns null and logs when jwtVerify throws", async () => {
    vi.stubEnv("CF_ACCESS_ENABLED", "true");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "myteam.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "test-aud");

    const { jwtVerify } = await import("jose/jwt/verify");
    const err = new Error("JWT expired");
    err.name = "JWTExpired";
    vi.mocked(jwtVerify).mockRejectedValueOnce(err);

    const { verifyCloudflareAccessJwt } = await import("./cloudflareAccess");
    const result = await verifyCloudflareAccessJwt("expired-token");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("JWTExpired"));
  });

  it("returns null when the email claim is missing from the JWT payload", async () => {
    vi.stubEnv("CF_ACCESS_ENABLED", "true");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "myteam.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "test-aud");

    const { jwtVerify } = await import("jose/jwt/verify");
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: "sub1" }, // no email claim
      protectedHeader: { alg: "RS256" },
    } as never);

    const { verifyCloudflareAccessJwt } = await import("./cloudflareAccess");
    const result = await verifyCloudflareAccessJwt("no-email-token");

    expect(result).toBeNull();
  });
});
