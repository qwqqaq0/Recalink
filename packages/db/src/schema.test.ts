import { describe, expect, it } from "vitest";
import {
  aiTagSuggestions,
  bookmarkSources,
  bookmarkTags,
  bookmarks,
  folders,
  pageContents,
  tags
} from "./schema.js";

describe("database schema", () => {
  it("exposes all first-version entities", () => {
    expect(Object.keys(bookmarks)).toContain("normalizedUrl");
    expect(Object.keys(bookmarkSources)).toContain("externalId");
    expect(Object.keys(folders)).toContain("path");
    expect(Object.keys(pageContents)).toContain("plainText");
    expect(Object.keys(tags)).toContain("normalizedName");
    expect(Object.keys(bookmarkTags)).toContain("bookmarkId");
    expect(Object.keys(aiTagSuggestions)).toContain("status");
  });
});
