import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { assertPublicAddress } from "./network.js";

type Resolver = (hostname: string) => Promise<string[]>;
type PinnedFetcher = (
  url: URL,
  address: string,
  signal: AbortSignal
) => Promise<Response>;

export interface FetchPublicHtmlOptions {
  resolver?: Resolver;
  fetcher?: PinnedFetcher;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface PublicHtmlResult {
  html: string;
  finalUrl: string;
}

export const PUBLIC_HTML_USER_AGENT = "Recalink/0.1 (+local personal indexer)";

const defaultResolver: Resolver = async (hostname) => {
  const unwrapped = hostname.replace(/^\[|\]$/gu, "");
  if (isIP(unwrapped)) return [unwrapped];
  const results = await lookup(unwrapped, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

function responseHeaders(
  source: Record<string, string | string[] | undefined>
): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

const fetchPinned: PinnedFetcher = async (url, address, signal) =>
  new Promise<Response>((resolve, reject) => {
    const family = isIP(address);
    if (family !== 4 && family !== 6) {
      reject(new Error("DNS 返回了无效 IP 地址"));
      return;
    }
    const pinnedLookup: LookupFunction = (_hostname, _options, callback) =>
      callback(null, address, family);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        lookup: pinnedLookup,
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": PUBLIC_HTML_USER_AGENT
        }
      },
      (incoming) => {
        const status = incoming.statusCode ?? 500;
        const hasBody = status !== 204 && status !== 205 && status !== 304;
        const body = hasBody
          ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
          : null;
        resolve(
          new Response(body, {
            status,
            ...(incoming.statusMessage
              ? { statusText: incoming.statusMessage }
              : {}),
            headers: responseHeaders(incoming.headers)
          })
        );
      }
    );
    request.on("error", reject);
    request.end();
  });

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
  const fetcher = options.fetcher ?? fetchPinned;
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

    const response = await fetcher(
      currentUrl,
      addresses[0]!,
      AbortSignal.timeout(timeoutMs)
    );

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
