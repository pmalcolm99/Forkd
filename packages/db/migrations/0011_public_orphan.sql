CREATE TYPE "public"."bill_split_ai_status" AS ENUM('none', 'queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bill_split_allocation" AS ENUM('proportional', 'even');--> statement-breakpoint
CREATE TYPE "public"."bill_split_fx_mode" AS ENUM('none', 'rate', 'statement');--> statement-breakpoint
CREATE TYPE "public"."bill_split_status" AS ENUM('draft', 'open', 'settled', 'archived');--> statement-breakpoint
CREATE TABLE "bill_split_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"shares" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bill_split_claims_item_participant_unique" UNIQUE("item_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "bill_split_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"file_path" text NOT NULL,
	"thumb_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"byte_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_split_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit_price_cents" integer,
	"total_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_split_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"guest_token" text,
	"guest_token_expires_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bill_split_participants_guest_token_unique" UNIQUE("guest_token")
);
--> statement-breakpoint
CREATE TABLE "bill_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"restaurant_id" uuid,
	"merchant_name" text,
	"purchased_at" timestamp,
	"created_by_user_id" text,
	"paid_by_participant_id" uuid,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"home_currency" char(3) DEFAULT 'USD' NOT NULL,
	"fx_mode" "bill_split_fx_mode" DEFAULT 'none' NOT NULL,
	"fx_rate" numeric(18, 8),
	"statement_total_cents" integer,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"service_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"tip_mode" "bill_split_allocation" DEFAULT 'proportional' NOT NULL,
	"tax_mode" "bill_split_allocation" DEFAULT 'proportional' NOT NULL,
	"party_size" integer,
	"share_token" text NOT NULL,
	"share_enabled" boolean DEFAULT true NOT NULL,
	"status" "bill_split_status" DEFAULT 'draft' NOT NULL,
	"ai_status" "bill_split_ai_status" DEFAULT 'none' NOT NULL,
	"ai_error" text,
	"hide_images_from_others" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "bill_splits_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "venmo_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cash_app_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "payment_note" text;--> statement-breakpoint
ALTER TABLE "bill_split_claims" ADD CONSTRAINT "bill_split_claims_split_id_bill_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_claims" ADD CONSTRAINT "bill_split_claims_item_id_bill_split_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."bill_split_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_claims" ADD CONSTRAINT "bill_split_claims_participant_id_bill_split_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."bill_split_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_images" ADD CONSTRAINT "bill_split_images_split_id_bill_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_items" ADD CONSTRAINT "bill_split_items_split_id_bill_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_participants" ADD CONSTRAINT "bill_split_participants_split_id_bill_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."bill_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_split_participants" ADD CONSTRAINT "bill_split_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_split_claims_split_idx" ON "bill_split_claims" USING btree ("split_id");--> statement-breakpoint
CREATE INDEX "bill_split_claims_participant_idx" ON "bill_split_claims" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "bill_split_images_split_idx" ON "bill_split_images" USING btree ("split_id");--> statement-breakpoint
CREATE INDEX "bill_split_items_split_idx" ON "bill_split_items" USING btree ("split_id");--> statement-breakpoint
CREATE INDEX "bill_split_participants_split_idx" ON "bill_split_participants" USING btree ("split_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_split_participants_split_user_unique" ON "bill_split_participants" USING btree ("split_id","user_id") WHERE "bill_split_participants"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "bill_splits_created_by_idx" ON "bill_splits" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "bill_splits_restaurant_idx" ON "bill_splits" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "bill_splits_created_at_idx" ON "bill_splits" USING btree ("created_at");