import z from "zod";

export const MAX_PHOTOS_PER_RESTAURANT = 10;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const uploadPhotoFormSchema = z.object({
  restaurantId: z.string().uuid(),
});

export const deletePhotoInput = z.object({
  id: z.string().uuid(),
});

export const listPhotosInput = z.object({
  restaurantId: z.string().uuid(),
});
