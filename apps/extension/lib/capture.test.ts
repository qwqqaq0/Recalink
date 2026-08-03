import { describe, expect, it } from "vitest";
import { chooseCapturedText } from "./capture.js";

describe("chooseCapturedText", () => {
  it("falls back to visible text when Readability returns a suspiciously short fragment", () => {
    expect(
      chooseCapturedText(
        "很短",
        "导航和动态正文 edge-explicit-capture-7f3a9，内容明显更完整。"
      )
    ).toContain("edge-explicit-capture-7f3a9");
  });

  it("keeps a substantial Readability article instead of page chrome", () => {
    const article = "正文".repeat(150);
    expect(chooseCapturedText(article, `菜单${article}页脚`)).toBe(article);
  });
});
