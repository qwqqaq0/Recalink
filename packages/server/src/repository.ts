import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type {
  CapturePayload,
  EdgeEvent,
  EdgeSyncNode
} from "@recalink/contracts";
import { flattenEdgeTree, normalizeUrl } from "@recalink/core";
import {
  aiTagSuggestions,
  bookmarkSources,
  bookmarkTags,
  bookmarks,
  folders,
  pageContents,
  tags,
  type Database
} from "@recalink/db";
import type { BookmarkSearchDocument } from "./meili.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type DatabaseExecutor = Database | DatabaseTransaction;

interface EdgeUpsertResult {
  bookmarkId: string;
  affectedBookmarkIds: string[];
  active: boolean;
}

export interface EdgeMutationResult {
  bookmarkId?: string;
  affectedBookmarkIds: string[];
}

function isSupportedUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export class BookmarkRepository {
  constructor(private readonly db: Database) {}

  async syncEdgeTree(nodes: EdgeSyncNode[]): Promise<{
    bookmarks: number;
    folders: number;
    skippedBookmarks: number;
    bookmarkIds: string[];
    affectedBookmarkIds: string[];
  }> {
    const flattened = flattenEdgeTree(nodes);
    const bookmarkIds = new Set<string>();
    const affectedBookmarkIds = new Set<string>();
    await this.db.transaction(async (tx) => {
      for (const folder of flattened.folders) {
        await tx
          .insert(folders)
          .values({
            externalId: folder.id,
            parentExternalId: folder.parentId ?? null,
            title: folder.title,
            path: folder.path
          })
          .onConflictDoUpdate({
            target: folders.externalId,
            set: {
              parentExternalId: folder.parentId ?? null,
              title: folder.title,
              path: folder.path,
              updatedAt: new Date()
            }
          });
      }
      const knownFolders = await tx.select().from(folders);
      const folderIdByExternal = new Map(
        knownFolders.map((folder) => [folder.externalId, folder.id])
      );
      for (const node of flattened.bookmarks) {
        const result = await this.upsertEdgeBookmark(
          node,
          folderIdByExternal.get(node.folderExternalId ?? ""),
          tx
        );
        if (result.active) bookmarkIds.add(result.bookmarkId);
        for (const id of result.affectedBookmarkIds)
          affectedBookmarkIds.add(id);
      }
      const activeIds = new Set(flattened.bookmarks.map((item) => item.id));
      const existingSources = await tx.select().from(bookmarkSources);
      for (const source of existingSources) {
        if (!activeIds.has(source.externalId) && !source.tombstonedAt) {
          await tx
            .update(bookmarkSources)
            .set({ tombstonedAt: new Date(), updatedAt: new Date() })
            .where(eq(bookmarkSources.id, source.id));
          await this.removeIfOrphaned(source.bookmarkId, tx);
          affectedBookmarkIds.add(source.bookmarkId);
        }
      }
    });
    return {
      bookmarks: flattened.bookmarks.length,
      folders: flattened.folders.length,
      skippedBookmarks: flattened.skippedBookmarks,
      bookmarkIds: [...bookmarkIds],
      affectedBookmarkIds: [...affectedBookmarkIds]
    };
  }

  async applyEdgeEvent(event: EdgeEvent): Promise<EdgeMutationResult> {
    if (event.type === "removed") return this.removeEdgeSource(event.id);
    if (!event.node.url) return { affectedBookmarkIds: [] };
    if (!isSupportedUrl(event.node.url))
      return this.removeEdgeSource(event.node.id);
    const folder = event.node.parentId
      ? await this.db.query.folders.findFirst({
          where: eq(folders.externalId, event.node.parentId)
        })
      : undefined;
    const result = await this.db.transaction((tx) =>
      this.upsertEdgeBookmark(
        {
          id: event.node.id,
          title: event.node.title,
          url: event.node.url!,
          ...(event.node.parentId
            ? { folderExternalId: event.node.parentId }
            : {}),
          ...(event.node.dateAdded !== undefined
            ? { dateAdded: event.node.dateAdded }
            : {})
        },
        folder?.id,
        tx
      )
    );
    return {
      ...(result.active ? { bookmarkId: result.bookmarkId } : {}),
      affectedBookmarkIds: result.affectedBookmarkIds
    };
  }

  private async removeEdgeSource(
    externalId: string
  ): Promise<EdgeMutationResult> {
    return this.db.transaction(async (tx) => {
      const source = await tx.query.bookmarkSources.findFirst({
        where: eq(bookmarkSources.externalId, externalId)
      });
      if (!source) return { affectedBookmarkIds: [] };
      if (!source.tombstonedAt) {
        await tx
          .update(bookmarkSources)
          .set({ tombstonedAt: new Date(), updatedAt: new Date() })
          .where(eq(bookmarkSources.id, source.id));
        await this.removeIfOrphaned(source.bookmarkId, tx);
      }
      return {
        bookmarkId: source.bookmarkId,
        affectedBookmarkIds: [source.bookmarkId]
      };
    });
  }

  async saveCapture(payload: CapturePayload): Promise<string> {
    return this.db.transaction(async (tx) => {
      const normalizedUrl = normalizeUrl(payload.url);
      const domain = new URL(normalizedUrl).hostname;
      const [bookmark] = await tx
        .insert(bookmarks)
        .values({
          normalizedUrl,
          url: payload.url,
          title: payload.title,
          description: payload.description,
          domain,
          captureStatus: "ready"
        })
        .onConflictDoUpdate({
          target: bookmarks.normalizedUrl,
          set: {
            url: payload.url,
            title: payload.title,
            description: payload.description,
            domain,
            captureStatus: "ready",
            lastError: null,
            removedAt: null,
            updatedAt: new Date()
          }
        })
        .returning({ id: bookmarks.id });
      if (!bookmark) throw new Error("保存书签失败");

      if (payload.sourceBookmarkId) {
        const folder = payload.folderExternalId
          ? await tx.query.folders.findFirst({
              where: eq(folders.externalId, payload.folderExternalId)
            })
          : undefined;
        await tx
          .insert(bookmarkSources)
          .values({
            bookmarkId: bookmark.id,
            externalId: payload.sourceBookmarkId,
            sourceTitle: payload.title,
            folderId: folder?.id ?? null
          })
          .onConflictDoUpdate({
            target: bookmarkSources.externalId,
            set: {
              bookmarkId: bookmark.id,
              sourceTitle: payload.title,
              folderId: folder?.id ?? null,
              updatedAt: new Date()
            }
          });
      }

      await this.writePageContent(bookmark.id, payload, tx);
      return bookmark.id;
    });
  }

  async saveCaptureForBookmark(
    bookmarkId: string,
    payload: CapturePayload
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [active] = await tx
        .update(bookmarks)
        .set({
          title: payload.title,
          description: payload.description,
          captureStatus: "ready",
          lastError: null,
          updatedAt: new Date()
        })
        .where(and(eq(bookmarks.id, bookmarkId), isNull(bookmarks.removedAt)))
        .returning({ id: bookmarks.id });
      if (!active) return false;
      await this.writePageContent(bookmarkId, payload, tx);
      return true;
    });
  }

  private async writePageContent(
    bookmarkId: string,
    payload: CapturePayload,
    database: DatabaseExecutor
  ): Promise<void> {
    const contentHash = createHash("sha256")
      .update(payload.plainText)
      .digest("hex");
    await database
      .insert(pageContents)
      .values({
        bookmarkId,
        headings: payload.headings,
        plainText: payload.plainText,
        language: payload.language,
        contentHash,
        extractionMethod: payload.extractionMethod
      })
      .onConflictDoUpdate({
        target: pageContents.bookmarkId,
        set: {
          headings: payload.headings,
          plainText: payload.plainText,
          language: payload.language,
          contentHash,
          extractionMethod: payload.extractionMethod,
          extractedAt: new Date()
        }
      });
  }

  async createLocal(url: string, title: string, note: string): Promise<string> {
    const normalizedUrl = normalizeUrl(url);
    const [bookmark] = await this.db
      .insert(bookmarks)
      .values({
        normalizedUrl,
        url,
        title,
        note,
        domain: new URL(normalizedUrl).hostname,
        localOnly: true,
        captureStatus: "pending"
      })
      .onConflictDoUpdate({
        target: bookmarks.normalizedUrl,
        set: {
          title,
          note,
          localOnly: true,
          removedAt: null,
          updatedAt: new Date()
        }
      })
      .returning({ id: bookmarks.id });
    if (!bookmark) throw new Error("创建书签失败");
    return bookmark.id;
  }

  async list() {
    return this.db.select().from(bookmarks).where(isNull(bookmarks.removedAt));
  }

  async get(id: string) {
    const bookmark = await this.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, id)
    });
    if (!bookmark) return undefined;
    const [content, sources, tagRows, suggestions] = await Promise.all([
      this.db.query.pageContents.findFirst({
        where: eq(pageContents.bookmarkId, id)
      }),
      this.db
        .select()
        .from(bookmarkSources)
        .where(eq(bookmarkSources.bookmarkId, id)),
      this.db
        .select({ id: tags.id, name: tags.name })
        .from(bookmarkTags)
        .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
        .where(eq(bookmarkTags.bookmarkId, id)),
      this.db
        .select()
        .from(aiTagSuggestions)
        .where(eq(aiTagSuggestions.bookmarkId, id))
    ]);
    return { ...bookmark, content, sources, tags: tagRows, suggestions };
  }

  async patch(
    id: string,
    patch: {
      titleOverride?: string | null | undefined;
      note?: string | undefined;
      tagIds?: string[] | undefined;
    }
  ): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if ("titleOverride" in patch)
      values.titleOverride = patch.titleOverride ?? null;
    if (patch.note !== undefined) values.note = patch.note;
    await this.db.update(bookmarks).set(values).where(eq(bookmarks.id, id));
    if (patch.tagIds) {
      await this.db.transaction(async (tx) => {
        await tx.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
        if (patch.tagIds?.length) {
          await tx
            .insert(bookmarkTags)
            .values(patch.tagIds.map((tagId) => ({ bookmarkId: id, tagId })));
        }
      });
    }
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(bookmarks)
        .set({ removedAt: new Date(), updatedAt: new Date() })
        .where(eq(bookmarks.id, id));
      await tx
        .update(bookmarkSources)
        .set({ tombstonedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(bookmarkSources.bookmarkId, id),
            isNull(bookmarkSources.tombstonedAt)
          )
        );
    });
  }

  async markCaptureState(
    id: string,
    status: "pending" | "processing" | "ready" | "metadata_only" | "failed",
    error?: string
  ): Promise<void> {
    await this.db
      .update(bookmarks)
      .set({
        captureStatus: status,
        lastError: error ?? null,
        updatedAt: new Date()
      })
      .where(and(eq(bookmarks.id, id), isNull(bookmarks.removedAt)));
  }

  async buildSearchDocument(
    id: string
  ): Promise<BookmarkSearchDocument | undefined> {
    const detail = await this.get(id);
    if (!detail || detail.removedAt) return undefined;
    const folderIds = detail.sources.flatMap((source) =>
      source.folderId && !source.tombstonedAt ? [source.folderId] : []
    );
    return {
      id: detail.id,
      title: detail.titleOverride || detail.title,
      note: detail.note,
      tagIds: detail.tags.map((tag) => tag.id),
      tagNames: detail.tags.map((tag) => tag.name),
      pageTitle: detail.title,
      headings: detail.content?.headings ?? [],
      description: detail.description,
      plainText: detail.content?.plainText ?? "",
      url: detail.url,
      domain: detail.domain,
      folderIds,
      captureStatus: detail.captureStatus,
      createdAtEpoch: detail.createdAt.getTime()
    };
  }

  async listTags() {
    return this.db.select().from(tags);
  }

  async createTag(name: string, createdBy: "manual" | "ai" = "manual") {
    const normalizedName = name.trim().toLocaleLowerCase("zh-CN");
    const [tag] = await this.db
      .insert(tags)
      .values({ name: name.trim(), normalizedName, createdBy })
      .onConflictDoUpdate({
        target: tags.normalizedName,
        set: { name: name.trim(), updatedAt: new Date() }
      })
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const affected = await tx
        .select({ bookmarkId: bookmarkTags.bookmarkId })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.tagId, id));
      await tx.delete(tags).where(eq(tags.id, id));
      return [...new Set(affected.map((row) => row.bookmarkId))];
    });
  }

  private async upsertEdgeBookmark(
    node: {
      id: string;
      title: string;
      url: string;
      folderExternalId?: string;
      dateAdded?: number;
    },
    folderId: string | undefined,
    database: DatabaseExecutor
  ): Promise<EdgeUpsertResult> {
    const existing = await database.query.bookmarkSources.findFirst({
      where: eq(bookmarkSources.externalId, node.id)
    });
    // A project tombstone wins over later full-sync snapshots with the same Edge ID.
    if (existing?.tombstonedAt) {
      return {
        bookmarkId: existing.bookmarkId,
        affectedBookmarkIds: [existing.bookmarkId],
        active: false
      };
    }

    const normalizedUrl = normalizeUrl(node.url);
    const [bookmark] = await database
      .insert(bookmarks)
      .values({
        normalizedUrl,
        url: node.url,
        title: node.title,
        domain: new URL(normalizedUrl).hostname,
        captureStatus: "pending"
      })
      .onConflictDoUpdate({
        target: bookmarks.normalizedUrl,
        set: {
          url: node.url,
          title: node.title,
          domain: new URL(normalizedUrl).hostname,
          removedAt: null,
          updatedAt: new Date()
        }
      })
      .returning({ id: bookmarks.id });
    if (!bookmark) throw new Error("同步 Edge 书签失败");

    const affected = new Set([bookmark.id]);
    if (existing) {
      await database
        .update(bookmarkSources)
        .set({
          bookmarkId: bookmark.id,
          sourceTitle: node.title,
          folderId: folderId ?? null,
          dateAdded: node.dateAdded ? new Date(node.dateAdded) : null,
          updatedAt: new Date()
        })
        .where(eq(bookmarkSources.id, existing.id));
      if (existing.bookmarkId !== bookmark.id) {
        await this.removeIfOrphaned(existing.bookmarkId, database);
        affected.add(existing.bookmarkId);
      }
    } else {
      await database.insert(bookmarkSources).values({
        bookmarkId: bookmark.id,
        externalId: node.id,
        sourceTitle: node.title,
        folderId: folderId ?? null,
        dateAdded: node.dateAdded ? new Date(node.dateAdded) : null
      });
    }
    return {
      bookmarkId: bookmark.id,
      affectedBookmarkIds: [...affected],
      active: true
    };
  }

  private async removeIfOrphaned(
    bookmarkId: string,
    database: DatabaseExecutor
  ): Promise<void> {
    const active = await database
      .select({ id: bookmarkSources.id })
      .from(bookmarkSources)
      .where(
        and(
          eq(bookmarkSources.bookmarkId, bookmarkId),
          isNull(bookmarkSources.tombstonedAt)
        )
      );
    const bookmark = await database.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId)
    });
    if (active.length === 0 && bookmark && !bookmark.localOnly) {
      await database
        .update(bookmarks)
        .set({ removedAt: new Date(), updatedAt: new Date() })
        .where(eq(bookmarks.id, bookmarkId));
    }
  }
}
