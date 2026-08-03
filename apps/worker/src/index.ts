import { createDatabase } from "@bookmark-recall/db";
import { extractReadableContent, fetchPublicHtml } from "@bookmark-recall/core";
import {
  BookmarkRepository,
  CAPTURE_QUEUE,
  createAiClientFromEnv,
  createQueue,
  INDEX_QUEUE,
  LlmTagSuggester,
  MeiliBookmarkIndex,
  startQueue,
  TAG_QUEUE,
  TagSuggestionRepository
} from "@bookmark-recall/server";

const { db, pool } = createDatabase();
const repository = new BookmarkRepository(db);
const searchIndex = new MeiliBookmarkIndex();
await searchIndex.ensure();
const boss = createQueue();
await startQueue(boss);
const aiClient = createAiClientFromEnv();
const tagRepository = new TagSuggestionRepository(db);
const tagSuggester = aiClient
  ? new LlmTagSuggester(aiClient, tagRepository)
  : undefined;

await boss.work<{ bookmarkId: string }>(CAPTURE_QUEUE, async ([job]) => {
  if (!job) return;
  const bookmark = await repository.get(job.data.bookmarkId);
  if (!bookmark || bookmark.removedAt) return;
  await repository.markCaptureState(bookmark.id, "processing");
  try {
    const fetched = await fetchPublicHtml(bookmark.url);
    const content = extractReadableContent(fetched.html, fetched.finalUrl);
    if (!content.plainText) {
      await repository.markCaptureState(
        bookmark.id,
        "metadata_only",
        "未提取到正文"
      );
      await boss.send(INDEX_QUEUE, { bookmarkId: bookmark.id });
      return;
    }

    const saved = await repository.saveCaptureForBookmark(bookmark.id, {
      url: bookmark.url,
      title: content.title || bookmark.title,
      description: content.description || bookmark.description,
      plainText: content.plainText,
      headings: content.headings,
      language: content.language,
      extractionMethod:
        content.extractionMethod === "visible-text"
          ? "visible_text"
          : "readability"
    });
    if (!saved) {
      await boss.send(INDEX_QUEUE, { bookmarkId: bookmark.id });
      return;
    }
    await boss.send(INDEX_QUEUE, { bookmarkId: bookmark.id });
    if (tagSuggester) await boss.send(TAG_QUEUE, { bookmarkId: bookmark.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "网页采集失败";
    const metadataOnly = message.includes("仅支持 HTML 页面");
    await repository.markCaptureState(
      bookmark.id,
      metadataOnly ? "metadata_only" : "failed",
      message
    );
    await boss.send(INDEX_QUEUE, { bookmarkId: bookmark.id });
    if (!metadataOnly) throw error;
  }
});

await boss.work<{ bookmarkId: string }>(INDEX_QUEUE, async ([job]) => {
  if (!job) return;
  const document = await repository.buildSearchDocument(job.data.bookmarkId);
  if (document) await searchIndex.put(document);
  else await searchIndex.remove(job.data.bookmarkId);
});

await boss.work<{ bookmarkId: string }>(TAG_QUEUE, async ([job]) => {
  if (!job || !tagSuggester) return;
  const bookmark = await repository.get(job.data.bookmarkId);
  if (bookmark?.content && !bookmark.removedAt)
    await tagSuggester.suggest(bookmark);
});

const close = async () => {
  await boss.stop();
  await pool.end();
};
process.on("SIGINT", () => void close().finally(() => process.exit(0)));
process.on("SIGTERM", () => void close().finally(() => process.exit(0)));
