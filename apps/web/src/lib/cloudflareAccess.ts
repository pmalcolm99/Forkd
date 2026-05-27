import { createRemoteJWKSet } from "jose/jwks/remote";
import { jwtVerify } from "jose/jwt/verify";

export type CfIdentity = { email: string; name?: string; sub: string };

// Lazily initialized to avoid errors in dev when CF_ACCESS_TEAM_DOMAIN is unset.
// jose caches keys internally after the first fetch so subsequent calls are fast.
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!JWKS) {
    JWKS = createRemoteJWKSet(
      new URL(`https://${process.env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    );
  }
  return JWKS;
}

// console.info is intentional here: this module is imported by proxy.ts which
// runs in the Next.js Edge Runtime where pino (Node.js streams) is not available.
export async function verifyCloudflareAccessJwt(token: string): Promise<CfIdentity | null> {
  if (process.env.CF_ACCESS_ENABLED !== "true") return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: process.env.CF_ACCESS_AUD,
      issuer: `https://${process.env.CF_ACCESS_TEAM_DOMAIN}`,
    });
    const email = payload["email"] as string | undefined;
    if (!email) return null;
    return {
      // Lowercase at extraction time so all downstream comparisons are case-insensitive.
      email: email.toLowerCase(),
      name: payload["name"] as string | undefined,
      sub: payload.sub ?? "",
    };
  } catch (e) {
    // Routine: JWT expired, wrong audience, signature mismatch, etc.
    console.info(`[CF Access] JWT verification failed: ${e instanceof Error ? e.name : "unknown"}`);
    return null;
  }
}
