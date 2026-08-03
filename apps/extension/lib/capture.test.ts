import { describe, expect, it } from "vitest";
import { chooseCapturedContent, chooseCapturedText } from "./capture.js";

describe("chooseCapturedText", () => {
  it("falls back to visible text when Readability returns a short fragment", () => {
    const selected = chooseCapturedContent(
      "too short",
      "Navigation and complete article edge-explicit-capture-7f3a9 with much more useful content for recall."
    );
    expect(selected.plainText).toContain("edge-explicit-capture-7f3a9");
    expect(selected.extractionMethod).toBe("visible_text");
  });

  it("keeps a substantial Readability article instead of page chrome", () => {
    const article = "article".repeat(150);
    expect(chooseCapturedText(article, `menu${article}footer`)).toBe(article);
    expect(
      chooseCapturedContent(article, `menu${article}footer`).extractionMethod
    ).toBe("readability");
  });
});
