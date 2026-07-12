ALTER TABLE "user" ADD COLUMN "map_default_view" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "default_filters" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_seen_changelog_version" text;--> statement-breakpoint
ALTER TABLE "restaurant_photos" ADD COLUMN "optimized_at" timestamp;--> statement-breakpoint
ALTER TABLE "restaurant_photos" ADD COLUMN "original_byte_size" integer;