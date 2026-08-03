import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const captureStatusEnum = pgEnum("capture_status", [
  "pending", "processing", "ready", "metadata_only", "failed"
]);
export const extractionMethodEnum = pgEnum("extraction_method", [
  "readability", "visible_text", "metadata_only"
]);
export const tagCreatorEnum = pgEnum("tag_creator", ["manual", "ai"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pending", "accepted", "rejected"
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  parentExternalId: text("parent_external_id"),
  title: text("title").notNull(),
  path: text("path").notNull(),
  ...timestamps
});

export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  url: text("url").notNull(),
  title: text("title").notNull().default(""),
  titleOverride: text("title_override"),
  description: text("description").notNull().default(""),
  domain: text("domain").notNull(),
  note: text("note").notNull().default(""),
  captureStatus: captureStatusEnum("capture_status").notNull().default("pending"),
  lastError: text("last_error"),
  localOnly: boolean("local_only").notNull().default(false),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  ...timestamps
}, (table) => [index("bookmarks_domain_idx").on(table.domain)]);

export const bookmarkSources = pgTable("bookmark_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookmarkId: uuid("bookmark_id").notNull().references(() => bookmarks.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull().unique(),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  sourceTitle: text("source_title").notNull().default(""),
  dateAdded: timestamp("date_added", { withTimezone: true }),
  tombstonedAt: timestamp("tombstoned_at", { withTimezone: true }),
  ...timestamps
}, (table) => [index("bookmark_sources_bookmark_idx").on(table.bookmarkId)]);

export const pageContents = pgTable("page_contents", {
  bookmarkId: uuid("bookmark_id").primaryKey().references(() => bookmarks.id, { onDelete: "cascade" }),
  headings: jsonb("headings").$type<string[]>().notNull().default([]),
  plainText: text("plain_text").notNull(),
  language: text("language").notNull().default("und"),
  contentHash: text("content_hash").notNull(),
  extractionMethod: extractionMethodEnum("extraction_method").notNull(),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow()
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  createdBy: tagCreatorEnum("created_by").notNull().default("manual"),
  ...timestamps
}, (table) => [uniqueIndex("tags_normalized_name_idx").on(table.normalizedName)]);

export const bookmarkTags = pgTable("bookmark_tags", {
  bookmarkId: uuid("bookmark_id").notNull().references(() => bookmarks.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.bookmarkId, table.tagId] })]);

export const aiTagSuggestions = pgTable("ai_tag_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookmarkId: uuid("bookmark_id").notNull().references(() => bookmarks.id, { onDelete: "cascade" }),
  existingTagId: uuid("existing_tag_id").references(() => tags.id, { onDelete: "cascade" }),
  suggestedName: text("suggested_name"),
  reason: text("reason").notNull().default(""),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  ...timestamps
}, (table) => [index("ai_tag_suggestions_bookmark_idx").on(table.bookmarkId)]);

export const bookmarkRelations = relations(bookmarks, ({ many, one }) => ({
  sources: many(bookmarkSources),
  tags: many(bookmarkTags),
  content: one(pageContents, { fields: [bookmarks.id], references: [pageContents.bookmarkId] })
}));

export const sourceRelations = relations(bookmarkSources, ({ one }) => ({
  bookmark: one(bookmarks, { fields: [bookmarkSources.bookmarkId], references: [bookmarks.id] }),
  folder: one(folders, { fields: [bookmarkSources.folderId], references: [folders.id] })
}));

