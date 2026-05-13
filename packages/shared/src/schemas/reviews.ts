import { z } from "zod";

export const reviewStarsSchema = z.number().int().min(1).max(5);
export const reviewTextMaxLength = 5000;

export const upsertReviewInput = z
  .object({
    restaurantId: z.string().uuid(),
    stars: reviewStarsSchema.nullable().optional(),
    text: z.string().max(reviewTextMaxLength).nullable().optional(),
  })
  .refine((v) => v.stars != null || (v.text != null && v.text.trim().length > 0), {
    message: "Provide a rating, written review, or both.",
  });
export type UpsertReviewInput = z.infer<typeof upsertReviewInput>;

// Form schema omits restaurantId — supplied from props at submit time.
export const reviewFormSchema = z
  .object({
    stars: reviewStarsSchema.nullable().optional(),
    text: z.string().max(reviewTextMaxLength).nullable().optional(),
  })
  .refine((v) => v.stars != null || (v.text != null && v.text.trim().length > 0), {
    message: "Provide a rating, written review, or both.",
  });
export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export const deleteReviewInput = z.object({ id: z.string().uuid() });
export type DeleteReviewInput = z.infer<typeof deleteReviewInput>;
