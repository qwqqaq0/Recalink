import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { fetchPublicHtml } from "./fetch.js";

describe("fetchPublicHtml", () => {
  it("blocks a hostname that resolves to a private address before fetching", async () => {
    const fetcher = vi.fn();
    await expect(
      fetchPublicHtml("https://internal.example", {
        resolver: async () => ["192.168.1.10"],
        fetcher
      })
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revalidates the destination after a redirect", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
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
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("pins the validated address used by an injected network request", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("<article>Hello</article>", {
          headers: { "content-type": "text/html; charset=utf-8" }
        })
    );
    const result = await fetchPublicHtml("https://public.example/article", {
      resolver: async () => ["1.1.1.1"],
      fetcher
    });

    expect(result.html).toBe("<article>Hello</article>");
    expect(result.finalUrl).toBe("https://public.example/article");
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://public.example/article"),
      "1.1.1.1",
      expect.any(AbortSignal)
    );
  });

  it("does not perform a second DNS lookup that can rebind to localhost", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<p>private</p>");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");

    try {
      await expect(
        fetchPublicHtml(`http://localhost:${address.port}`, {
          resolver: async () => ["93.184.216.34"],
          timeoutMs: 150
        })
      ).rejects.toThrow();
      expect(requests).toBe(0);
    } finally {
      server.close();
      await once(server, "close");
    }
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
    ).rejects.toThrow();
  });
});
