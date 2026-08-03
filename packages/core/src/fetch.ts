import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertPublicAddress } from "./network.js";

type Resolver = (hostname: string) => Promise<string[]>;

export interface FetchPublicHtmlOptions {
  resolver?: Resolver;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface PublicHtmlResult {
  html: string;
  finalUrl: string;
}

const defaultResolver: Resolver = async (hostname) => {
  const unwrapped = hostname.replace(/^\[|\]$/gu, "");
  if (isIP(unwrapped)) return [unwrapped];
  const results = await lookup(unwrapped, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("页面响应超过 5MB 限制");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("页面响应超过 5MB 限制");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function fetchPublicHtml(
  inputUrl: string,
  options: FetchPublicHtmlOptions = {}
): Promise<PublicHtmlResult> {
  const resolver = options.resolver ?? defaultResolver;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = new URL(inputUrl);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new Error("仅支持 HTTP(S) URL");
    }

    const addresses = await resolver(currentUrl.hostname);
    if (addresses.length === 0) throw new Error("域名未解析到任何地址");
    for (const address of addresses) assertPublicAddress(address);

    const response = await fetcher(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "BookmarkRecall/0.1 (+local personal indexer)"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("重定向响应缺少 Location");
      if (redirects === maxRedirects) throw new Error("页面重定向次数超过限制");
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) throw new Error(`页面请求失败：HTTP ${response.status}`);
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("仅支持 HTML 页面");
    }

    return {
      html: await readBoundedText(response, maxBytes),
      finalUrl: currentUrl.toString()
    };
  }

  throw new Error("页面重定向次数超过限制");
}
