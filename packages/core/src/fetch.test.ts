import { once } from "node:events";
import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions
} from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_HTML_USER_AGENT, fetchPublicHtml } from "./fetch.js";

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return { ...actual, request: vi.fn(actual.request) };
});

afterEach(async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  vi.mocked(httpRequest).mockReset().mockImplementation(actual.request);
});

describe("fetchPublicHtml", () => {
  it("sends the Recalink user agent through the default HTTP fetcher", async () => {
    let requestOptions: RequestOptions | undefined;
    vi.mocked(httpRequest).mockImplementationOnce(((
      _url: string | URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void
    ) => {
      requestOptions = options;
      const response = Readable.from([
        Buffer.from("<article>Hello</article>")
      ]) as unknown as IncomingMessage;
      Object.assign(response, {
        statusCode: 200,
        statusMessage: "OK",
        headers: { "content-type": "text/html; charset=utf-8" }
      });
      callback(response);
      return {
        on: vi.fn().mockReturnThis(),
        end: vi.fn()
      } as unknown as ClientRequest;
    }) as typeof httpRequest);

    await fetchPublicHtml("http://public.example/article", {
      resolver: async () => ["1.1.1.1"]
    });

    const headers = requestOptions?.headers as
      Record<string, string> | undefined;
    expect(headers?.["user-agent"]).toBe(PUBLIC_HTML_USER_AGENT);
    expect(PUBLIC_HTML_USER_AGENT).toMatch(/^Recalink\//u);
  });

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
