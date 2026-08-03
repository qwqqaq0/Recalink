import { describe, expect, it } from "vitest";
import {
  SearchService,
  type SearchBackend,
  type SearchHit
} from "./search-service.js";

const hit = (id: string): SearchHit => ({
  id,
  title: `title-${id}`,
  url: `https://example.com/${id}`,
  domain: "example.com",
  snippet: `snippet-${id}`,
  matchedFields: ["plainText"],
  matchedTerms: [id]
});

describe("SearchService", () => {
  it("expands, fuses, and safely reranks candidates", async () => {
    const backend: SearchBackend = {
      search: async (query) =>
        query === "original" ? [hit("a"), hit("b")] : [hit("b"), hit("c")]
    };
    const service = new SearchService(backend, {
      expand: async () => ({ alternateQueries: ["alternate"], keywords: [] }),
      rerank: async () => [
        { bookmarkId: "invented", reason: "invalid" },
        { bookmarkId: "c", reason: "最符合含义" }
      ]
    });
    const result = await service.search({
      q: "original",
      ai: true,
      page: 1,
      limit: 20
    });
    expect(result.items.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(result.items[0]?.aiReason).toBe("最符合含义");
    expect(result.meta.aiApplied).toBe(true);
  });

  it("falls back to basic search when AI fails", async () => {
    const backend: SearchBackend = { search: async () => [hit("a")] };
    const service = new SearchService(backend, {
      expand: async () => {
        throw new Error("offline");
      },
      rerank: async () => []
    });
    const result = await service.search({
      q: "original",
      ai: true,
      page: 1,
      limit: 20
    });
    expect(result.items.map((item) => item.id)).toEqual(["a"]);
    expect(result.meta.aiApplied).toBe(false);
    expect(result.meta.aiFallbackReason).toContain("offline");
  });
});
