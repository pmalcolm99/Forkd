CREATE TABLE "api_usage" (
	"day" date NOT NULL,
	"endpoint" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_day_endpoint_pk" PRIMARY KEY("day","endpoint")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "google_price_level" integer;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "google_opening_hours" jsonb;