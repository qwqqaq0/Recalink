// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("searches bookmarks and displays the matched snippet", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health")) return Response.json({ database: true, search: true, worker: true, ai: false });
      if (url.includes("/tags")) return Response.json([]);
      if (url.includes("/search")) return Response.json({
        items: [{ id: "1", title: "PostgreSQL 查询计划", url: "https://example.com", domain: "example.com", snippet: "索引存在但选择了 sequential scan", matchedFields: ["plainText"], matchedTerms: ["索引"] }],
        meta: { query: "索引未使用", expandedQueries: [], aiApplied: false, tookMs: 12 }
      });
      return Response.json([]);
    }));

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("搜索标题、正文、标签或记得的大意…"), { target: { value: "索引未使用" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(screen.getByText("PostgreSQL 查询计划")).toBeInTheDocument());
    expect(screen.getByText(/sequential scan/)).toBeInTheDocument();
  });
});
