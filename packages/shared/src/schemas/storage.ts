import { z } from "zod";

export const deleteStoragePhotoInput = z.object({
  photoId: z.string().uuid(),
});
export type DeleteStoragePhotoInput = z.infer<typeof deleteStoragePhotoInput>;

export const deleteOrphanFileInput = z.object({
  // Path relative to the uploads root (e.g. "restaurants/<id>/<photo>.webp").
  // No absolute paths and no parent-dir traversal — the server also enforces this.
  relPath: z
    .string()
    .min(1)
    .max(512)
    .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), {
      message: "Invalid path",
    }),
});
export type DeleteOrphanFileInput = z.infer<typeof deleteOrphanFileInput>;
