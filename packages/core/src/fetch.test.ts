import { describe, expect, it, vi } from "vitest";
import { fetchPublicHtml } from "./fetch.js";

describe("fetchPublicHtml", () => {
  it("blocks a hostname that resolves to a private address before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      fetchPublicHtml("https://internal.example", {
        resolver: async () => ["192.168.1.10"],
        fetcher
      })
    ).rejects.toThrow("不允许访问私有或特殊网络地址");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revalidates the destination after a redirect", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" }
      })
    );
    await expect(
      fetchPublicHtml("https://public.example", {
        resolver: async (hostname) =>
          hostname === "public.example" ? ["1.1.1.1"] : ["127.0.0.1"],
        fetcher
      })
    ).rejects.toThrow("不允许访问私有或特殊网络地址");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded HTML response", async () => {
    const result = await fetchPublicHtml("https://public.example/article", {
      resolver: async () => ["1.1.1.1"],
      fetcher: async () =>
        new Response("<article>Hello</article>", {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
    });
    expect(result.html).toBe("<article>Hello</article>");
    expect(result.finalUrl).toBe("https://public.example/article");
  });

  it("rejects non-HTML responses", async () => {
    await expect(
      fetchPublicHtml("https://public.example/file.pdf", {
        resolver: async () => ["1.1.1.1"],
        fetcher: async () =>
          new Response("pdf", {
            headers: { "content-type": "application/pdf" }
          })
      })
    ).rejects.toThrow("仅支持 HTML 页面");
  });
});
