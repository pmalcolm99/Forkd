import "server-only";
import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { db, user, session } from "@forkd/db";
import { makeSignature } from "@forkd/auth";
import { logger } from "@forkd/shared";
import type { CfIdentity } from "./cloudflareAccess";

export async function provisionSessionForIdentity(
  identity: CfIdentity,
  userAgent?: string | null,
  ipAddress?: string | null
): Promise<string> {
  // 1. Look up existing user by email (already lowercased by verifyCloudflareAccessJwt)
  let [existing] = await db.select().from(user).where(eq(user.email, identity.email)).limit(1);

  if (!existing) {
    // 2. First user in the DB becomes Owner+Admin; all subsequent users are regular Users.
    const [ownerRow] = await db.select({ c: count() }).from(user).where(eq(user.isOwner, true));
    const isFirst = (ownerRow?.c ?? 0) === 0;

    if (isFirst) {
      // Warn loudly so the operator can verify the email in the logs immediately.
      logger.warn(
        { email: identity.email },
        "CF Access: first user provisioned as Owner — verify this is the intended Owner email"
      );
    } else {
      logger.info({ email: identity.email }, "CF Access: new user provisioned");
    }

    // 3. Store the full name claim in user.name; leave firstName/lastName null.
    //    The /welcome prompt handles first+last name collection. Never auto-split:
    //    space-splitting breaks compound names, single-word names, and "Last, First" formats.
    const userId = randomUUID();
    await db.insert(user).values({
      id: userId,
      email: identity.email,
      emailVerified: true,
      name: identity.name ?? identity.email,
      firstName: null,
      lastName: null,
      isAdmin: isFirst,
      isOwner: isFirst,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    [existing] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  } else if (identity.name && existing.name !== identity.name) {
    // 4. Keep user.name in sync with the JWT name claim (e.g. display name changed in IdP).
    //    Do NOT touch firstName/lastName — user may have set those manually via /welcome.
    await db
      .update(user)
      .set({ name: identity.name, updatedAt: new Date() })
      .where(eq(user.id, existing.id));
  }

  // 5. Mint session using the same pattern as devSignIn:
  //    - rawToken is inserted into the DB session.token column
  //    - signedToken (rawToken.signature) is what goes in the cookie
  const rawToken = randomUUID();
  const signedToken = `${rawToken}.${await makeSignature(rawToken, process.env.MASTER_KEY!)}`;

  await db.insert(session).values({
    id: randomUUID(),
    token: rawToken,
    userId: existing!.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });

  return signedToken;
}
