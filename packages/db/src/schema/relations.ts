import { relations } from "drizzle-orm";
import { user } from "./auth";
import { cuisineTypes } from "./cuisines";
import { restaurants } from "./restaurants";
import { restaurantReviews } from "./reviews";
import { restaurantPhotos } from "./photos";

export const userRelations = relations(user, ({ many }) => ({
  restaurants: many(restaurants, { relationName: "addedBy" }),
  reviews: many(restaurantReviews),
  photos: many(restaurantPhotos, { relationName: "uploadedBy" }),
}));

export const cuisineTypeRelations = relations(cuisineTypes, ({ many }) => ({
  restaurants: many(restaurants),
}));

export const restaurantRelations = relations(restaurants, ({ one, many }) => ({
  cuisineType: one(cuisineTypes, {
    fields: [restaurants.cuisineTypeId],
    references: [cuisineTypes.id],
  }),
  addedBy: one(user, {
    fields: [restaurants.addedByUserId],
    references: [user.id],
    relationName: "addedBy",
  }),
  reviews: many(restaurantReviews),
  photos: many(restaurantPhotos),
}));

export const restaurantReviewRelations = relations(restaurantReviews, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantReviews.restaurantId],
    references: [restaurants.id],
  }),
  user: one(user, {
    fields: [restaurantReviews.userId],
    references: [user.id],
  }),
}));

export const restaurantPhotoRelations = relations(restaurantPhotos, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [restaurantPhotos.restaurantId],
    references: [restaurants.id],
  }),
  uploadedBy: one(user, {
    fields: [restaurantPhotos.uploadedByUserId],
    references: [user.id],
    relationName: "uploadedBy",
  }),
}));
