import { describe, expect, it } from "vitest";
import { bookmarkNodeToSyncNode, createdEvent, removedEvent } from "./sync.js";

describe("extension sync payloads", () => {
  it("keeps only API-safe bookmark tree fields", () => {
    const node = bookmarkNodeToSyncNode({
      id: "10", parentId: "1", title: "文档", url: "https://example.com", dateAdded: 123,
      children: [{ id: "11", parentId: "10", title: "子目录", children: [] }]
    });
    expect(node).toEqual({ id: "10", parentId: "1", title: "文档", url: "https://example.com", dateAdded: 123,
      children: [{ id: "11", parentId: "10", title: "子目录", children: [] }] });
  });

  it("creates bounded event payloads", () => {
    expect(createdEvent("5", { id: "ignored", parentId: "2", title: "页面", url: "https://a.test" })).toEqual({
      type: "created", node: { id: "5", parentId: "2", title: "页面", url: "https://a.test" }
    });
    expect(removedEvent("5")).toEqual({ type: "removed", id: "5" });
  });
});
