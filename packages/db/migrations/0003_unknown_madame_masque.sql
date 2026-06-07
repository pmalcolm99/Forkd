CREATE TYPE "public"."photo_source" AS ENUM('user', 'google_places');--> statement-breakpoint
ALTER TABLE "restaurant_photos" ADD COLUMN "source" "photo_source" DEFAULT 'user' NOT NULL;