ALTER TABLE "restaurants" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
CREATE INDEX "restaurants_country_idx" ON "restaurants" USING btree ("country");