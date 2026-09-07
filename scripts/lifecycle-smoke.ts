import { randomUUID } from "node:crypto";
import { requireEmptySmokeDatabase } from "./smoke-safety.js";

const apiUrl = (process.env.SMOKE_API_URL ?? "http://127.0.0.1:3210").replace(
  /\/$/u,
  ""
);
const token = process.env.EXTENSION_API_TOKEN ?? "change-this-extension-token";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      authorization: `Bearer ${token}`,
      ...init?.headers
    }
  });
  if (!response.ok)
    throw new Error(
      `${init?.method ?? "GET"} ${path} -> ${response.status}: ${await response.text()}`
    );
  return response.json() as Promise<T>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface SearchResponse {
  items: Array<{ id: string; url: string; snippet: string }>;
}

async function eventually(
  operation: () => Promise<SearchResponse>,
  predicate: (value: SearchResponse) => boolean,
  message: string
): Promise<void> {
  const deadline = Date.now() + 20_000;
  let last: SearchResponse | undefined;
  while (Date.now() < deadline) {
    last = await operation();
    if (predicate(last)) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`${message}; last=${JSON.stringify(last)}`);
}

function tree(children: object[]) {
  return { nodes: [{ id: "0", title: "root", children }] };
}

async function capture(
  url: string,
  sourceBookmarkId: string,
  marker: string
): Promise<string> {
  const result = await request<{ bookmarkId: string }>("/captures", {
    method: "POST",
    body: JSON.stringify({
      url,
      title: `Lifecycle ${marker}`,
      description: "synthetic lifecycle fixture",
      plainText: `Only this captured body contains ${marker}.`,
      headings: ["Lifecycle"],
      language: "en",
      extractionMethod: "visible_text",
      sourceBookmarkId
    })
  });
  return result.bookmarkId;
}

async function main() {
  await requireEmptySmokeDatabase();
  const suffix = randomUUID().slice(0, 8);
  const url = `https://lifecycle.invalid/shared-${suffix}`;
  const newUrl = `https://lifecycle.invalid/changed-${suffix}`;
  const sourceA = `source-a-${suffix}`;
  const sourceB = `source-b-${suffix}`;
  const marker = `shared-marker-${suffix}`;

  const initial = await request<{
    bookmarks: number;
    skippedBookmarks: number;
  }>("/edge/sync", {
    method: "POST",
    body: JSON.stringify(
      tree([
        { id: sourceA, title: "shared A", url },
        { id: sourceB, title: "shared B", url },
        { id: `file-${suffix}`, title: "local", url: "file:///C:/note" }
      ])
    )
  });
  assert(initial.bookmarks === 2, "full sync lost supported bookmarks");
  assert(initial.skippedBookmarks === 1, "unsupported URL was not counted");

  const sharedBookmarkId = await capture(url, sourceA, marker);
  await eventually(
    () => request(`/search?q=${encodeURIComponent(marker)}&ai=false`),
    (result) => result.items[0]?.id === sharedBookmarkId,
    "shared bookmark was not indexed"
  );

  await request("/edge/events", {
    method: "POST",
    body: JSON.stringify({ type: "removed", id: sourceA })
  });
  await eventually(
    () => request(`/search?q=${encodeURIComponent(marker)}&ai=false`),
    (result) => result.items.some((item) => item.id === sharedBookmarkId),
    "removing one source incorrectly removed a shared bookmark"
  );

  await request("/edge/events", {
    method: "POST",
    body: JSON.stringify({
      type: "changed",
      node: { id: sourceB, title: "changed URL", url: newUrl }
    })
  });
  await eventually(
    () => request(`/search?q=${encodeURIComponent(marker)}&ai=false`),
    (result) => !result.items.some((item) => item.id === sharedBookmarkId),
    "changing the last source URL left a ghost search result"
  );

  const staleSource = `stale-${suffix}`;
  const staleUrl = `https://lifecycle.invalid/stale-${suffix}`;
  const staleMarker = `stale-marker-${suffix}`;
  await request("/edge/sync", {
    method: "POST",
    body: JSON.stringify(
      tree([{ id: staleSource, title: "stale", url: staleUrl }])
    )
  });
  const staleBookmarkId = await capture(staleUrl, staleSource, staleMarker);
  await eventually(
    () => request(`/search?q=${encodeURIComponent(staleMarker)}&ai=false`),
    (result) => result.items.some((item) => item.id === staleBookmarkId),
    "full-sync fixture was not indexed"
  );

  await request("/edge/sync", {
    method: "POST",
    body: JSON.stringify(tree([]))
  });
  await eventually(
    () => request(`/search?q=${encodeURIComponent(staleMarker)}&ai=false`),
    (result) => !result.items.some((item) => item.id === staleBookmarkId),
    "full sync did not clean a stale search document"
  );

  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "unsupported-url-skip",
        "shared-source-removal",
        "url-change-ghost-cleanup",
        "full-sync-index-reconciliation"
      ]
    })
  );
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
