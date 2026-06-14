export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, user } from "@forkd/db";
import { logger } from "@forkd/shared";
import { transferDocumentSchema, importRestaurants } from "@/lib/restaurantTransfer";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!rows[0]?.isOwner) return Response.json({ message: "Forbidden" }, { status: 403 });

  // Reject oversized requests before buffering the body
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    return Response.json({ message: "File too large (max 10 MB)" }, { status: 413 });
  }

  let fileBlob: Blob | null = null;
  try {
    const formData = await req.formData();
    fileBlob = formData.get("file") as Blob | null;
  } catch {
    return Response.json({ message: "Failed to parse request" }, { status: 400 });
  }

  if (!fileBlob) return Response.json({ message: "No file provided" }, { status: 400 });
  if (fileBlob.size > MAX_BYTES) {
    return Response.json({ message: "File too large (max 10 MB)" }, { status: 413 });
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(await fileBlob.text());
  } catch {
    return Response.json({ message: "Invalid JSON file" }, { status: 400 });
  }

  const parsed = transferDocumentSchema.safeParse(rawJson);
  if (!parsed.success) {
    return Response.json(
      { message: "Invalid export file format", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const summary = await db.transaction((tx) => importRestaurants(tx, parsed.data));
    return Response.json(summary);
  } catch (err) {
    logger.error({ err, userId: session.user.id }, "Restaurant import failed");
    return Response.json({ message: "Import failed. No changes were saved." }, { status: 500 });
  }
}
