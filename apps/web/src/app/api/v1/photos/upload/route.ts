import { and, count, eq, isNull } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, restaurantPhotos, restaurants } from "@forkd/db";
import {
  ACCEPTED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_RESTAURANT,
  logger,
  photoStoragePath,
  photoThumbStoragePath,
  uploadPhotoFormSchema,
} from "@forkd/shared";
import { detectImageFormat, processUploadedImage } from "@/lib/photoProcessing";
import { ensureRestaurantDir, writePhotoFiles } from "@/lib/photoStorage";

export async function POST(req: Request): Promise<Response> {
  // 1. Session check
  const sessionData = await auth.api.getSession({ headers: req.headers });
  if (!sessionData?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }
  const user = sessionData.user;

  let restaurantId: string;
  let fileBlob: Blob | null;

  try {
    // 2. Parse FormData and validate non-file fields
    const formData = await req.formData();
    const parsed = uploadPhotoFormSchema.safeParse({
      restaurantId: formData.get("restaurantId"),
    });
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid request", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }
    restaurantId = parsed.data.restaurantId;
    fileBlob = formData.get("file") as Blob | null;
  } catch {
    return Response.json({ message: "Failed to parse form data" }, { status: 400 });
  }

  if (!fileBlob) {
    return Response.json({ message: "No file provided" }, { status: 400 });
  }

  // 3. Restaurant exists and not soft-deleted (cheap check before reading file)
  const restaurant = await db.query.restaurants.findFirst({
    where: and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)),
  });
  if (!restaurant) {
    return Response.json({ message: "Restaurant not found" }, { status: 404 });
  }

  // 4. Photo count check
  const [countResult] = await db
    .select({ total: count() })
    .from(restaurantPhotos)
    .where(eq(restaurantPhotos.restaurantId, restaurantId));
  if ((countResult?.total ?? 0) >= MAX_PHOTOS_PER_RESTAURANT) {
    return Response.json(
      { message: `Photo limit reached (${MAX_PHOTOS_PER_RESTAURANT} max)` },
      { status: 409 }
    );
  }

  // 5. File size check (before reading into memory)
  if (fileBlob.size > MAX_PHOTO_BYTES) {
    return Response.json({ message: "File too large (max 10 MB)" }, { status: 400 });
  }

  // 6. MIME type check
  const mimeType = fileBlob.type;
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return Response.json(
      { message: "Unsupported file type. Accepted: JPEG, PNG, WebP, HEIC." },
      { status: 400 }
    );
  }

  // 7. Read file into Buffer
  const arrayBuffer = await fileBlob.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  // 8. Magic-byte validation
  const detectedFormat = detectImageFormat(buf);
  if (!detectedFormat) {
    return Response.json({ message: "File does not appear to be a valid image" }, { status: 400 });
  }

  // 9. Process image with Sharp
  let full: Buffer, thumb: Buffer, width: number, height: number, byteSize: number;
  try {
    ({ full, thumb, width, height, byteSize } = await processUploadedImage(buf));
  } catch (err) {
    logger.warn({ restaurantId, userId: user.id, err }, "Image processing failed");
    return Response.json(
      { message: "Could not process image. The file may be corrupt or unsupported." },
      { status: 400 }
    );
  }

  // 10. Write files to disk
  const photoId = crypto.randomUUID();
  try {
    await ensureRestaurantDir(restaurantId);
    await writePhotoFiles(restaurantId, photoId, full, thumb);
  } catch (err) {
    logger.error({ restaurantId, photoId, userId: user.id, err }, "Failed to write photo files");
    return Response.json({ message: "Failed to store photo" }, { status: 500 });
  }

  // 11. Insert DB row
  const filePath = photoStoragePath(restaurantId, photoId);
  const thumbPath = photoThumbStoragePath(restaurantId, photoId);
  const [row] = await db
    .insert(restaurantPhotos)
    .values({
      id: photoId,
      restaurantId,
      uploadedByUserId: user.id,
      filePath,
      thumbPath,
      width,
      height,
      byteSize,
    })
    .returning();

  return Response.json({ id: row!.id, filePath: row!.filePath, thumbPath: row!.thumbPath });
}
