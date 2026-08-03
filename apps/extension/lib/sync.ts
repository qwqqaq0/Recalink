export interface BookmarkNodeLike {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNodeLike[];
}

export interface SyncNode {
  id: string; parentId?: string; title: string; url?: string; dateAdded?: number; children?: SyncNode[];
}

export function bookmarkNodeToSyncNode(node: BookmarkNodeLike): SyncNode {
  return {
    id: node.id,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.dateAdded !== undefined ? { dateAdded: node.dateAdded } : {}),
    ...(node.children ? { children: node.children.map(bookmarkNodeToSyncNode) } : {})
  };
}

export function createdEvent(id: string, node: BookmarkNodeLike) {
  return { type: "created" as const, node: bookmarkNodeToSyncNode({ ...node, id }) };
}

export function changedEvent(node: BookmarkNodeLike) {
  return { type: "changed" as const, node: bookmarkNodeToSyncNode(node) };
}

export function movedEvent(node: BookmarkNodeLike) {
  return { type: "moved" as const, node: bookmarkNodeToSyncNode(node) };
}

export function removedEvent(id: string) { return { type: "removed" as const, id }; }
