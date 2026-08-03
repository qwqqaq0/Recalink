import { describe, expect, it } from "vitest";
import { flattenEdgeTree } from "./edge.js";

describe("flattenEdgeTree", () => {
  it("preserves folder paths and bookmark parent ids", () => {
    const result = flattenEdgeTree([
      {
        id: "0",
        title: "root",
        children: [
          {
            id: "1",
            parentId: "0",
            title: "收藏栏",
            children: [
              {
                id: "2",
                parentId: "1",
                title: "开发",
                children: [
                  {
                    id: "3",
                    parentId: "2",
                    title: "PostgreSQL",
                    url: "https://example.com/post"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]);

    expect(result.folders.map((folder) => folder.path)).toContain(
      "收藏栏/开发"
    );
    expect(result.bookmarks[0]).toMatchObject({
      id: "3",
      folderExternalId: "2"
    });
  });

  it("skips unsupported bookmark schemes without losing valid entries", () => {
    const result = flattenEdgeTree([
      {
        id: "0",
        title: "root",
        children: [
          { id: "1", title: "local", url: "file:///C:/notes.html" },
          { id: "2", title: "bookmarklet", url: "javascript:void(0)" },
          { id: "3", title: "web", url: "https://example.com" }
        ]
      }
    ]);

    expect(result.bookmarks.map((item) => item.id)).toEqual(["3"]);
    expect(result.skippedBookmarks).toBe(2);
  });
});
