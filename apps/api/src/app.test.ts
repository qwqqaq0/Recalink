import { describe, expect, it, vi } from "vitest";
import type {
  BookmarkRepository,
  BookmarkSearchDocument,
  MeiliBookmarkIndex,
  SearchService
} from "@bookmark-recall/server";
import { buildApp } from "./app.js";

const health = async () => ({
  database: true,
  search: true,
  worker: true,
  ai: false
});

describe("API app", () => {
  it("reports service health without an extension token", async () => {
    const app = buildApp({ extensionToken: "secret", health });
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().ai).toBe(false);
    await app.close();
  });

  it("protects extension sync endpoints with a bearer token", async () => {
    const app = buildApp({ extensionToken: "secret", health });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/edge/sync",
      payload: { nodes: [] }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("requires a token when an extension reads local search data", async () => {
    const searchService = {
      search: vi.fn().mockResolvedValue({ items: [] })
    } as unknown as SearchService;
    const app = buildApp({
      extensionToken: "secret",
      health,
      searchService
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=test",
      headers: { origin: "chrome-extension://untrusted" }
    });
    expect(response.statusCode).toBe(401);
    expect(searchService.search).not.toHaveBeenCalled();
    await app.close();
  });
  it("protects all non-health data routes from untrusted extensions", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([])
    } as unknown as BookmarkRepository;
    const app = buildApp({ extensionToken: "secret", health, repository });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/bookmarks",
      headers: { origin: "chrome-extension://untrusted" }
    });
    expect(response.statusCode).toBe(401);
    expect(repository.list).not.toHaveBeenCalled();
    await app.close();
  });

  it("keeps an active bookmark indexed when one Edge source is removed", async () => {
    const document = {
      id: "11111111-1111-4111-8111-111111111111"
    } as BookmarkSearchDocument;
    const repository = {
      applyEdgeEvent: vi.fn().mockResolvedValue({
        bookmarkId: document.id,
        affectedBookmarkIds: [document.id]
      }),
      buildSearchDocument: vi.fn().mockResolvedValue(document)
    } as unknown as BookmarkRepository;
    const searchIndex = {
      put: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    } as unknown as MeiliBookmarkIndex;
    const app = buildApp({
      extensionToken: "secret",
      health,
      repository,
      searchIndex
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/edge/events",
      headers: { authorization: "Bearer secret" },
      payload: { type: "removed", id: "edge-source-1" }
    });

    expect(response.statusCode).toBe(200);
    expect(searchIndex.put).toHaveBeenCalledWith(document);
    expect(searchIndex.remove).not.toHaveBeenCalled();
    await app.close();
  });

  it("queues stale index cleanup discovered by a full sync", async () => {
    const staleId = "11111111-1111-4111-8111-111111111111";
    const repository = {
      syncEdgeTree: vi.fn().mockResolvedValue({
        bookmarks: 0,
        folders: 0,
        skippedBookmarks: 0,
        bookmarkIds: [],
        affectedBookmarkIds: [staleId]
      })
    } as unknown as BookmarkRepository;
    const queue = { send: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp({
      extensionToken: "secret",
      health,
      repository,
      queue
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/edge/sync",
      headers: { authorization: "Bearer secret" },
      payload: { nodes: [] }
    });

    expect(response.statusCode).toBe(200);
    expect(queue.send).toHaveBeenCalledWith("index-bookmark", {
      bookmarkId: staleId
    });
    await app.close();
  });

  it("reindexes every affected bookmark after deleting a tag", async () => {
    const bookmarkIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ];
    const repository = {
      deleteTag: vi.fn().mockResolvedValue(bookmarkIds)
    } as unknown as BookmarkRepository;
    const queue = { send: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp({
      extensionToken: "secret",
      health,
      repository,
      queue
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/tags/33333333-3333-4333-8333-333333333333"
    });

    expect(response.statusCode).toBe(200);
    expect(queue.send).toHaveBeenCalledTimes(2);
    expect(queue.send).toHaveBeenCalledWith("index-bookmark", {
      bookmarkId: bookmarkIds[0]
    });
    expect(queue.send).toHaveBeenCalledWith("index-bookmark", {
      bookmarkId: bookmarkIds[1]
    });
    await app.close();
  });

  it("accepts the documented 500k-character CJK capture", async () => {
    const bookmarkId = "11111111-1111-4111-8111-111111111111";
    const repository = {
      saveCapture: vi.fn().mockResolvedValue(bookmarkId)
    } as unknown as BookmarkRepository;
    const app = buildApp({
      extensionToken: "secret",
      health,
      repository
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/captures",
      headers: { authorization: "Bearer secret" },
      payload: {
        url: "https://example.com/large",
        title: "large",
        description: "",
        plainText: "汉".repeat(500_000),
        headings: [],
        language: "zh-CN",
        extractionMethod: "visible_text"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ bookmarkId });
    await app.close();
  });
});
