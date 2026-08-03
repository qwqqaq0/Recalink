import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "@bookmark-recall/db";
import {
  BookmarkRepository, createAiClientFromEnv, createQueue, LlmSearchAssistant,
  MeiliBookmarkIndex, SearchService, startQueue, TagSuggestionRepository
} from "@bookmark-recall/server";
import { buildApp } from "./app.js";

const extensionToken = process.env.EXTENSION_API_TOKEN;
if (!extensionToken) throw new Error("缺少 EXTENSION_API_TOKEN");

const { db, pool } = createDatabase();
await migrate(db, { migrationsFolder: resolve(process.env.MIGRATIONS_DIR ?? "packages/db/migrations") });
const repository = new BookmarkRepository(db);
const tagSuggestions = new TagSuggestionRepository(db);
const searchIndex = new MeiliBookmarkIndex();
await searchIndex.ensure();
const boss = createQueue();
await startQueue(boss);
const aiClient = createAiClientFromEnv();
const searchService = new SearchService(
  searchIndex,
  aiClient ? new LlmSearchAssistant(aiClient) : undefined
);

const app = buildApp({
  extensionToken,
  repository,
  tagSuggestions,
  searchIndex,
  searchService,
  queue: boss,
  health: async () => {
    const [database, search] = await Promise.all([
      pool.query("select 1").then(() => true).catch(() => false),
      searchIndex.client.health().then(() => true).catch(() => false)
    ]);
    return { database, search, worker: true, ai: Boolean(aiClient) };
  }
});

await app.register(cors, {
  origin: (origin, callback) => {
    const allowed = !origin || origin.startsWith("chrome-extension://") || origin.startsWith("extension://") || origin.startsWith("http://127.0.0.1:");
    callback(allowed ? null : new Error("不允许的来源"), allowed);
  }
});

const webRoot = resolve(process.env.WEB_ROOT ?? "apps/web/dist");
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
}

const close = async () => {
  await app.close();
  await boss.stop();
  await pool.end();
};
process.on("SIGINT", () => void close().finally(() => process.exit(0)));
process.on("SIGTERM", () => void close().finally(() => process.exit(0)));

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3210) });

