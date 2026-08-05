import { browser } from "wxt/browser";
import { apiRequest } from "../lib/client.js";
import {
  bookmarkNodeToSyncNode,
  changedEvent,
  createdEvent,
  movedEvent,
  removedEvent
} from "../lib/sync.js";

async function fullSync() {
  const tree = await browser.bookmarks.getTree();
  return apiRequest<{ bookmarks: number; folders: number }>("/edge/sync", {
    method: "POST",
    body: JSON.stringify({ nodes: tree.map(bookmarkNodeToSyncNode) })
  });
}

async function nodeById(id: string) {
  const [node] = await browser.bookmarks.get(id);
  return node;
}

async function report(path: string, body: unknown) {
  try {
    await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    console.warn("Recalink 同步失败", error);
  }
}

async function reportNodeEvent(kind: "changed" | "moved", id: string) {
  const node = await nodeById(id);
  if (!node) return;
  if (!node.url) {
    await fullSync();
    return;
  }
  await report(
    "/edge/events",
    kind === "changed" ? changedEvent(node) : movedEvent(node)
  );
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void fullSync().catch(console.warn);
  });
  browser.runtime.onStartup.addListener(() => {
    void fullSync().catch(console.warn);
  });

  browser.bookmarks.onCreated.addListener((id, node) => {
    if (node.url) void report("/edge/events", createdEvent(id, node));
    else void fullSync().catch(console.warn);
  });
  browser.bookmarks.onChanged.addListener((id) => {
    void reportNodeEvent("changed", id).catch(console.warn);
  });
  browser.bookmarks.onMoved.addListener((id) => {
    void reportNodeEvent("moved", id).catch(console.warn);
  });
  browser.bookmarks.onRemoved.addListener((id, info) => {
    if (info.node.url) void report("/edge/events", removedEvent(id));
    else void fullSync().catch(console.warn);
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if ((message as { type?: string })?.type === "bookmark-recall:full-sync")
      return fullSync();
    return undefined;
  });
});
