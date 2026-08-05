import type { EdgeSyncNode } from "@recalink/contracts";

export interface FlatEdgeFolder {
  id: string;
  parentId?: string;
  title: string;
  path: string;
}

export interface FlatEdgeBookmark {
  id: string;
  title: string;
  url: string;
  folderExternalId?: string;
  dateAdded?: number;
}

function isSupportedUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function flattenEdgeTree(nodes: EdgeSyncNode[]): {
  folders: FlatEdgeFolder[];
  bookmarks: FlatEdgeBookmark[];
  skippedBookmarks: number;
} {
  const folders: FlatEdgeFolder[] = [];
  const bookmarks: FlatEdgeBookmark[] = [];
  let skippedBookmarks = 0;

  const visit = (
    node: EdgeSyncNode,
    parentPath: string,
    isRoot: boolean
  ): void => {
    if (node.url) {
      if (!isSupportedUrl(node.url)) {
        skippedBookmarks += 1;
        return;
      }
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        ...(node.parentId ? { folderExternalId: node.parentId } : {}),
        ...(node.dateAdded !== undefined ? { dateAdded: node.dateAdded } : {})
      });
      return;
    }

    const path = isRoot
      ? parentPath
      : [parentPath, node.title].filter(Boolean).join("/");
    if (!isRoot) {
      folders.push({
        id: node.id,
        ...(node.parentId ? { parentId: node.parentId } : {}),
        title: node.title,
        path
      });
    }
    for (const child of node.children ?? []) visit(child, path, false);
  };

  for (const node of nodes) visit(node, "", true);
  return { folders, bookmarks, skippedBookmarks };
}
