import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type {
  CapturePayload,
  EdgeEvent,
  EdgeSyncNode
} from "@bookmark-recall/contracts";
import { flattenEdgeTree, normalizeUrl } from "@bookmark-recall/core";
import {
  aiTagSuggestions,
  bookmarkSources,
  bookmarkTags,
  bookmarks,
  folders,
  pageContents,
  tags,
  type Database
} from "@bookmark-recall/db";
import type { BookmarkSearchDocument } from "./meili.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type DatabaseExecutor = Database | DatabaseTransaction;

export class BookmarkRepository {
  constructor(private readonly db: Database) {}

  async syncEdgeTree(
    nodes: EdgeSyncNode[]
  ): Promise<{ bookmarks: number; folders: number; bookmarkIds: string[] }> {
    const flattened = flattenEdgeTree(nodes);
    const bookmarkIds: string[] = [];
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
        const bookmarkId = await this.upsertEdgeBookmark(
          node,
          folderIdByExternal.get(node.folderExternalId ?? ""),
          tx
        );
        bookmarkIds.push(bookmarkId);
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
        }
      }
    });
    return {
      bookmarks: flattened.bookmarks.length,
      folders: flattened.folders.length,
      bookmarkIds
    };
  }

  async applyEdgeEvent(event: EdgeEvent): Promise<string | undefined> {
    if (event.type === "removed") {
      const source = await this.db.query.bookmarkSources.findFirst({
        where: eq(bookmarkSources.externalId, event.id)
      });
      if (!source) return undefined;
      await this.db
        .update(bookmarkSources)
        .set({ tombstonedAt: new Date(), updatedAt: new Date() })
        .where(eq(bookmarkSources.id, source.id));
      await this.removeIfOrphaned(source.bookmarkId, this.db);
      return source.bookmarkId;
    }
    if (!event.node.url) return undefined;
    const folder = event.node.parentId
      ? await this.db.query.folders.findFirst({
          where: eq(folders.externalId, event.node.parentId)
        })
      : undefined;
    return this.upsertEdgeBookmark(
      {
        id: event.node.id,
        title: event.node.title,
        url: event.node.url,
        ...(event.node.parentId
          ? { folderExternalId: event.node.parentId }
          : {}),
        ...(event.node.dateAdded !== undefined
          ? { dateAdded: event.node.dateAdded }
          : {})
      },
      folder?.id,
      this.db
    );
  }

  async saveCapture(payload: CapturePayload): Promise<string> {
    const normalizedUrl = normalizeUrl(payload.url);
    const domain = new URL(normalizedUrl).hostname;
    const [bookmark] = await this.db
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
        ? await this.db.query.folders.findFirst({
            where: eq(folders.externalId, payload.folderExternalId)
          })
        : undefined;
      await this.db
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

    const contentHash = createHash("sha256")
      .update(payload.plainText)
      .digest("hex");
    await this.db
      .insert(pageContents)
      .values({
        bookmarkId: bookmark.id,
        headings: payload.headings,
        plainText: payload.plainText,
        language: payload.language,
        contentHash,
        extractionMethod: "readability"
      })
      .onConflictDoUpdate({
        target: pageContents.bookmarkId,
        set: {
          headings: payload.headings,
          plainText: payload.plainText,
          language: payload.language,
          contentHash,
          extractionMethod: "readability",
          extractedAt: new Date()
        }
      });
    return bookmark.id;
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
    await this.db
      .update(bookmarks)
      .set({ removedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookmarks.id, id));
    await this.db
      .update(bookmarkSources)
      .set({ tombstonedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bookmarkSources.bookmarkId, id),
          isNull(bookmarkSources.tombstonedAt)
        )
      );
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
      .where(eq(bookmarks.id, id));
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

  async deleteTag(id: string) {
    await this.db.delete(tags).where(eq(tags.id, id));
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
  ): Promise<string> {
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
          updatedAt: new Date()
        }
      })
      .returning({ id: bookmarks.id });
    if (!bookmark) throw new Error("同步Edge书签失败");
    const existing = await database.query.bookmarkSources.findFirst({
      where: eq(bookmarkSources.externalId, node.id)
    });
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
    } else {
      await database.insert(bookmarkSources).values({
        bookmarkId: bookmark.id,
        externalId: node.id,
        sourceTitle: node.title,
        folderId: folderId ?? null,
        dateAdded: node.dateAdded ? new Date(node.dateAdded) : null
      });
      await database
        .update(bookmarks)
        .set({ removedAt: null, updatedAt: new Date() })
        .where(eq(bookmarks.id, bookmark.id));
    }
    return bookmark.id;
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
