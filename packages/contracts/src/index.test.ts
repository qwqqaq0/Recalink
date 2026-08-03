import { describe, expect, it } from "vitest";
import {
  aiExpansionSchema,
  aiRerankSchema,
  capturePayloadSchema,
  edgeEventSchema,
  edgeSyncSchema,
  searchQuerySchema
} from "./index.js";

describe("capturePayloadSchema", () => {
  it("accepts a rendered page capture", () => {
    const parsed = capturePayloadSchema.parse({
      url: "https://example.com/article",
      title: "Article",
      plainText: "Body",
      headings: ["Heading"],
      language: "en",
      sourceBookmarkId: "42"
    });
    expect(parsed.sourceBookmarkId).toBe("42");
    expect(parsed.extractionMethod).toBe("readability");
  });

  it("rejects oversized page content", () => {
    expect(() =>
      capturePayloadSchema.parse({
        url: "https://example.com",
        title: "Large",
        plainText: "x".repeat(500_001),
        headings: [],
        language: "en"
      })
    ).toThrow();
  });

  it("rejects a non-HTTP explicit capture", () => {
    expect(
      capturePayloadSchema.safeParse({
        url: "file:///C:/notes.html",
        title: "local",
        plainText: "text",
        headings: []
      }).success
    ).toBe(false);
  });
});

describe("Edge contracts", () => {
  it("requires removed events to carry the external id", () => {
    expect(edgeEventSchema.parse({ type: "removed", id: "99" })).toEqual({
      type: "removed",
      id: "99"
    });
  });

  it("accepts unsupported Edge URLs for later per-item skipping", () => {
    expect(
      edgeSyncSchema.safeParse({
        nodes: [{ id: "1", title: "local", url: "file:///C:/notes.html" }]
      }).success
    ).toBe(true);
  });
});

describe("searchQuerySchema", () => {
  it("applies safe pagination defaults", () => {
    const result = searchQuerySchema.parse({ q: "postgres" });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.ai).toBe(false);
  });
});

describe("AI response contracts", () => {
  it("caps alternate queries and accepts structured rerank output", () => {
    expect(
      aiExpansionSchema.parse({
        alternateQueries: ["query planner"],
        keywords: ["EXPLAIN"]
      })
    ).toEqual({ alternateQueries: ["query planner"], keywords: ["EXPLAIN"] });

    expect(
      aiRerankSchema.parse({
        results: [{ bookmarkId: "id-1", reason: "命中查询计划" }]
      })
    ).toEqual({ results: [{ bookmarkId: "id-1", reason: "命中查询计划" }] });
  });
});
