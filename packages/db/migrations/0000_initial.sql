CREATE TYPE "capture_status" AS ENUM ('pending', 'processing', 'ready', 'metadata_only', 'failed');
CREATE TYPE "extraction_method" AS ENUM ('readability', 'visible_text', 'metadata_only');
CREATE TYPE "tag_creator" AS ENUM ('manual', 'ai');
CREATE TYPE "suggestion_status" AS ENUM ('pending', 'accepted', 'rejected');

CREATE TABLE "folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "external_id" text NOT NULL UNIQUE,
  "parent_external_id" text, "title" text NOT NULL, "path" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "normalized_url" text NOT NULL UNIQUE,
  "url" text NOT NULL, "title" text NOT NULL DEFAULT '', "title_override" text,
  "description" text NOT NULL DEFAULT '', "domain" text NOT NULL, "note" text NOT NULL DEFAULT '',
  "capture_status" capture_status NOT NULL DEFAULT 'pending', "last_error" text,
  "local_only" boolean NOT NULL DEFAULT false, "removed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "bookmarks_domain_idx" ON "bookmarks" ("domain");
CREATE TABLE "bookmark_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "external_id" text NOT NULL UNIQUE, "folder_id" uuid REFERENCES "folders"("id") ON DELETE SET NULL,
  "source_title" text NOT NULL DEFAULT '', "date_added" timestamptz, "tombstoned_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "bookmark_sources_bookmark_idx" ON "bookmark_sources" ("bookmark_id");
CREATE TABLE "page_contents" (
  "bookmark_id" uuid PRIMARY KEY REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "headings" jsonb NOT NULL DEFAULT '[]'::jsonb, "plain_text" text NOT NULL,
  "language" text NOT NULL DEFAULT 'und', "content_hash" text NOT NULL,
  "extraction_method" extraction_method NOT NULL, "extracted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "name" text NOT NULL,
  "normalized_name" text NOT NULL, "created_by" tag_creator NOT NULL DEFAULT 'manual',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "tags_normalized_name_idx" ON "tags" ("normalized_name");
CREATE TABLE "bookmark_tags" (
  "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("bookmark_id", "tag_id")
);
CREATE TABLE "ai_tag_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "bookmark_id" uuid NOT NULL REFERENCES "bookmarks"("id") ON DELETE CASCADE,
  "existing_tag_id" uuid REFERENCES "tags"("id") ON DELETE CASCADE, "suggested_name" text,
  "reason" text NOT NULL DEFAULT '', "status" suggestion_status NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ai_tag_suggestion_target" CHECK (("existing_tag_id" IS NOT NULL) <> ("suggested_name" IS NOT NULL))
);
CREATE INDEX "ai_tag_suggestions_bookmark_idx" ON "ai_tag_suggestions" ("bookmark_id");

