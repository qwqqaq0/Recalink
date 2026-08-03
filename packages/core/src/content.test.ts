import { describe, expect, it } from "vitest";
import { clampPlainText, extractReadableContent } from "./content.js";

describe("clampPlainText", () => {
  it("normalizes whitespace and caps text length", () => {
    expect(clampPlainText("  hello\n\n world  ", 8)).toBe("hello wo");
  });
});

describe("extractReadableContent", () => {
  it("extracts article text and headings without form values", () => {
    const html = `<!doctype html><html lang="zh-CN"><head><title>索引指南</title><meta name="description" content="数据库文章"></head><body><article><h1>PostgreSQL 索引</h1><p>${"查询计划与索引选择。".repeat(40)}</p><input value="secret" /></article></body></html>`;
    const result = extractReadableContent(html, "https://example.com/post");

    expect(result.title).toBe("索引指南");
    expect(result.description).toBe("数据库文章");
    expect(result.headings).toContain("PostgreSQL 索引");
    expect(result.plainText).toContain("查询计划");
    expect(result.plainText).not.toContain("secret");
    expect(result.language).toBe("zh-CN");
  });
});

