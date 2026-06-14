import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { restaurantPhotos, restaurants } from "@forkd/db";
import { deletePhotoInput, listPhotosInput, logger } from "@forkd/shared";
import { protectedProcedure, router } from "../trpc";

export const photosRouter = router({
  list: protectedProcedure.input(listPhotosInput).query(async ({ input, ctx }) => {
    const restaurant = await ctx.db.query.restaurants.findFirst({
      where: and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)),
    });
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });

    return ctx.db.query.restaurantPhotos.findMany({
      where: eq(restaurantPhotos.restaurantId, input.restaurantId),
      with: {
        uploadedBy: { columns: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [desc(restaurantPhotos.createdAt)],
    });
  }),

  delete: protectedProcedure.input(deletePhotoInput).mutation(async ({ input, ctx }) => {
    const photo = await ctx.db.query.restaurantPhotos.findFirst({
      where: eq(restaurantPhotos.id, input.id),
    });
    if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

    const isUploader = photo.uploadedByUserId === ctx.user.id;
    const canDelete = isUploader || ctx.user.isAdmin || ctx.user.isOwner;
    if (!canDelete) throw new TRPCError({ code: "FORBIDDEN" });

    try {
      await ctx.fileStore?.deletePhotoFiles(photo.restaurantId, photo.id);
    } catch (err) {
      logger.error(
        { photoId: photo.id, restaurantId: photo.restaurantId, err },
        "Failed to delete photo files"
      );
    }

    await ctx.db.delete(restaurantPhotos).where(eq(restaurantPhotos.id, input.id));

    // Clear cover photo reference if this photo was the restaurant's cover.
    await ctx.db
      .update(restaurants)
      .set({ coverPhotoId: null })
      .where(eq(restaurants.coverPhotoId, input.id));

    return { success: true };
  }),
});
