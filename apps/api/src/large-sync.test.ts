import { describe, expect, it, vi } from "vitest";
import type { BookmarkRepository } from "@bookmark-recall/server";
import { buildApp } from "./app.js";

describe("large Edge full sync", () => {
  it("accepts a valid tree larger than Fastify's default 1 MiB", async () => {
    const repository = {
      syncEdgeTree: vi.fn().mockResolvedValue({
        bookmarks: 5_000,
        folders: 0,
        skippedBookmarks: 0,
        bookmarkIds: [],
        affectedBookmarkIds: []
      })
    } as unknown as BookmarkRepository;
    const app = buildApp({
      extensionToken: "secret",
      repository,
      health: async () => ({
        database: true,
        search: true,
        worker: true,
        ai: false
      })
    });
    const children = Array.from({ length: 5_000 }, (_, index) => ({
      id: `bookmark-${index}`,
      parentId: "0",
      title: `Bookmark ${index} ${"t".repeat(150)}`,
      url: `https://example.com/${index}?context=${"q".repeat(100)}`
    }));
    const payload = { nodes: [{ id: "0", title: "root", children }] };
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(
      1024 * 1024
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/edge/sync",
      headers: { authorization: "Bearer secret" },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(repository.syncEdgeTree).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
