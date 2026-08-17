import { relations } from "drizzle-orm";
import { user } from "./auth";
import { cuisineTypes } from "./cuisines";
import { restaurants } from "./restaurants";
import { restaurantReviews } from "./reviews";
import { restaurantPhotos } from "./photos";
import {
  billSplits,
  billSplitImages,
  billSplitItems,
  billSplitParticipants,
  billSplitClaims,
} from "./splits";

export const userRelations = relations(user, ({ many }) => ({
  restaurants: many(restaurants, { relationName: "addedBy" }),
  reviews: many(restaurantReviews),
  photos: many(restaurantPhotos, { relationName: "uploadedBy" }),
  billSplits: many(billSplits, { relationName: "splitCreatedBy" }),
  billSplitParticipations: many(billSplitParticipants),
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
  billSplits: many(billSplits),
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

export const billSplitRelations = relations(billSplits, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [billSplits.restaurantId],
    references: [restaurants.id],
  }),
  createdBy: one(user, {
    fields: [billSplits.createdByUserId],
    references: [user.id],
    relationName: "splitCreatedBy",
  }),
  images: many(billSplitImages),
  items: many(billSplitItems),
  participants: many(billSplitParticipants),
  claims: many(billSplitClaims),
}));

export const billSplitImageRelations = relations(billSplitImages, ({ one }) => ({
  split: one(billSplits, {
    fields: [billSplitImages.splitId],
    references: [billSplits.id],
  }),
}));

export const billSplitItemRelations = relations(billSplitItems, ({ one, many }) => ({
  split: one(billSplits, {
    fields: [billSplitItems.splitId],
    references: [billSplits.id],
  }),
  claims: many(billSplitClaims),
}));

export const billSplitParticipantRelations = relations(billSplitParticipants, ({ one, many }) => ({
  split: one(billSplits, {
    fields: [billSplitParticipants.splitId],
    references: [billSplits.id],
  }),
  user: one(user, {
    fields: [billSplitParticipants.userId],
    references: [user.id],
  }),
  claims: many(billSplitClaims),
}));

export const billSplitClaimRelations = relations(billSplitClaims, ({ one }) => ({
  split: one(billSplits, {
    fields: [billSplitClaims.splitId],
    references: [billSplits.id],
  }),
  item: one(billSplitItems, {
    fields: [billSplitClaims.itemId],
    references: [billSplitItems.id],
  }),
  participant: one(billSplitParticipants, {
    fields: [billSplitClaims.participantId],
    references: [billSplitParticipants.id],
  }),
}));
