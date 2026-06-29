CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DROP INDEX "documents_content_hash_idx";--> statement-breakpoint
-- Add the column nullable first so existing rows don't violate NOT NULL.
ALTER TABLE "documents" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
-- Ensure a Default collection exists and move any pre-existing documents into it.
INSERT INTO "collections" ("id", "slug", "name", "description", "is_sample")
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default', 'Documents added before collections existed.', false)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
UPDATE "documents" SET "collection_id" = '00000000-0000-0000-0000-000000000001' WHERE "collection_id" IS NULL;--> statement-breakpoint
-- Now that every row has a value, enforce NOT NULL and the FK.
ALTER TABLE "documents" ALTER COLUMN "collection_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_collection_id_idx" ON "documents" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "documents_collection_content_hash_idx" ON "documents" USING btree ("collection_id","content_hash");