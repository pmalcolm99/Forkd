import { and, eq, isNull } from "drizzle-orm";
import z from "zod";
import { auth } from "@forkd/auth";
import { db, restaurantPhotos, restaurants } from "@forkd/db";
import { readPhotoFile } from "@/lib/photoStorage";

const FILENAME_RE = /^[0-9a-f-]{36}(_thumb)?\.webp$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  // 1. Session check
  const sessionData = await auth.api.getSession({ headers: req.headers });
  if (!sessionData?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Validate path shape: ["restaurants", restaurantId, filename]
  const { path: segments } = await params;
  if (segments.length !== 3 || segments[0] !== "restaurants") {
    return new Response("Not Found", { status: 404 });
  }
  // length === 3 is confirmed above; non-null assertions are safe
  const restaurantId = segments[1]!;
  const filename = segments[2]!;

  // 3. Validate restaurantId is a UUID
  if (!z.string().uuid().safeParse(restaurantId).success) {
    return new Response("Not Found", { status: 404 });
  }

  // 4. Validate filename shape
  if (!FILENAME_RE.test(filename)) {
    return new Response("Not Found", { status: 404 });
  }

  // 5. Extract photoId (strip optional _thumb suffix and .webp extension)
  const photoId = filename.replace(/_thumb\.webp$/, "").replace(/\.webp$/, "");
  const isThumb = filename.endsWith("_thumb.webp");

  // 6. Look up photo row
  const photo = await db.query.restaurantPhotos.findFirst({
    where: and(eq(restaurantPhotos.id, photoId), eq(restaurantPhotos.restaurantId, restaurantId)),
  });
  if (!photo) {
    return new Response("Not Found", { status: 404 });
  }

  // 7. Verify restaurant not soft-deleted
  const restaurant = await db.query.restaurants.findFirst({
    where: and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)),
  });
  if (!restaurant) {
    return new Response("Not Found", { status: 404 });
  }

  // 8. Serve the file
  const storagePath = isThumb ? photo.thumbPath : photo.filePath;
  try {
    const { stream, size } = await readPhotoFile(storagePath);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(size),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
