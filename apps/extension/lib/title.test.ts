import { describe, expect, it } from "vitest";
import {
  applyDefaultBookmarkTitle,
  chooseDefaultBookmarkTitle,
  loadDefaultBookmarkTitle,
  MAX_BOOKMARK_TITLE_LENGTH,
  normalizeBookmarkTitle,
  requireBookmarkTitle,
  withBookmarkTitle
} from "./title.js";

describe("bookmark title helpers", () => {
  it("prefers a trimmed non-empty tab title", () => {
    expect(
      chooseDefaultBookmarkTitle("  Useful article  ", "https://example.com")
    ).toBe("Useful article");
  });

  it("falls back to the URL for undefined or whitespace-only tab titles", () => {
    expect(
      chooseDefaultBookmarkTitle(undefined, " https://example.com/one ")
    ).toBe("https://example.com/one");
    expect(chooseDefaultBookmarkTitle("   ", " https://example.com/two ")).toBe(
      "https://example.com/two"
    );
  });

  it("trims and caps bookmark titles at the maximum length", () => {
    expect(
      normalizeBookmarkTitle(`  ${"a".repeat(MAX_BOOKMARK_TITLE_LENGTH + 1)}  `)
    ).toBe("a".repeat(MAX_BOOKMARK_TITLE_LENGTH));
  });

  it("rejects whitespace-only bookmark titles", () => {
    expect(() => requireBookmarkTitle("  \n ")).toThrow(/^书签名称不能为空$/);
  });

  it("overrides an extracted title while preserving the remaining fields", () => {
    const capture = {
      title: "Extracted title",
      url: "https://example.com",
      plainText: "Captured content"
    };

    expect(withBookmarkTitle(capture, "  My bookmark  ")).toEqual({
      ...capture,
      title: "My bookmark"
    });
  });
  it("loads a default from the first active tab and tolerates query failures", async () => {
    await expect(
      loadDefaultBookmarkTitle(async () => [
        { title: "  Active page  ", url: "https://example.com" }
      ])
    ).resolves.toBe("Active page");
    await expect(
      loadDefaultBookmarkTitle(async () => Promise.reject())
    ).resolves.toBe("");
  });

  it("preserves a user edit instead of applying an async default", () => {
    expect(applyDefaultBookmarkTitle("User title", "Async title", true)).toBe(
      "User title"
    );
    expect(applyDefaultBookmarkTitle("", "Async title", false)).toBe(
      "Async title"
    );
  });
});
