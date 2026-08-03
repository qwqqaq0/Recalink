import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url.js";

describe("normalizeUrl", () => {
  it("removes fragments, default ports, and tracking parameters", () => {
    expect(
      normalizeUrl("HTTPS://Example.COM:443/path/?utm_source=x&keep=1&fbclid=y#part")
    ).toBe("https://example.com/path?keep=1");
  });

  it("preserves content-affecting query parameters in stable order", () => {
    expect(normalizeUrl("https://example.com/search?z=2&q=postgres&a=1")).toBe(
      "https://example.com/search?a=1&q=postgres&z=2"
    );
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeUrl("file:///tmp/private.txt")).toThrow("仅支持 HTTP(S) URL");
  });
});

