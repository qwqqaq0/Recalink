import Fastify, { type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import {
  bookmarkPatchSchema,
  capturePayloadSchema,
  createBookmarkSchema,
  edgeEventSchema,
  edgeSyncSchema,
  searchQuerySchema
} from "@recalink/contracts";
import type {
  BookmarkRepository,
  MeiliBookmarkIndex,
  SearchService,
  TagSuggestionRepository
} from "@recalink/server";
import { CAPTURE_QUEUE, INDEX_QUEUE, TAG_QUEUE } from "@recalink/server";

interface QueueSender {
  send(name: string, data: object): Promise<unknown>;
}

export interface AppDependencies {
  extensionToken: string;
  health: () => Promise<{
    database: boolean;
    search: boolean;
    worker: boolean;
    ai: boolean;
  }>;
  repository?: BookmarkRepository;
  tagSuggestions?: TagSuggestionRepository;
  searchService?: SearchService;
  queue?: QueueSender;
  searchIndex?: MeiliBookmarkIndex;
}

function requireExtensionToken(expected: string) {
  return async (request: FastifyRequest): Promise<void> => {
    if (request.headers.authorization !== `Bearer ${expected}`) {
      const error = new Error("扩展令牌无效") as Error & {
        statusCode: number;
      };
      error.statusCode = 401;
      throw error;
    }
  };
}

export function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const requireRepo = () => {
    if (!deps.repository)
      throw Object.assign(new Error("数据库服务未配置"), { statusCode: 503 });
    return deps.repository;
  };
  const refreshIndex = async (bookmarkIds: string[]): Promise<void> => {
    const uniqueIds = [...new Set(bookmarkIds)];
    if (deps.queue) {
      await Promise.all(
        uniqueIds.map((bookmarkId) =>
          deps.queue!.send(INDEX_QUEUE, { bookmarkId })
        )
      );
      return;
    }
    if (!deps.searchIndex || !deps.repository) return;
    await Promise.all(
      uniqueIds.map(async (bookmarkId) => {
        const document = await deps.repository!.buildSearchDocument(bookmarkId);
        if (document) await deps.searchIndex!.put(document);
        else await deps.searchIndex!.remove(bookmarkId);
      })
    );
  };
  const protectExtensionRead = async (
    request: FastifyRequest
  ): Promise<void> => {
    const origin = request.headers.origin ?? "";
    if (
      origin.startsWith("chrome-extension://") ||
      origin.startsWith("extension://")
    ) {
      await requireExtensionToken(deps.extensionToken)(request);
    }
  };
  app.addHook("preHandler", async (request) => {
    if (request.method !== "OPTIONS" && request.url !== "/api/v1/health")
      await protectExtensionRead(request);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply
        .status(400)
        .send({ error: "请求参数无效", details: error.issues });
    const normalizedError =
      error instanceof Error ? error : new Error("未知服务错误");
    const candidateStatus = (
      normalizedError as Error & { statusCode?: unknown }
    ).statusCode;
    const statusCode =
      typeof candidateStatus === "number" ? candidateStatus : 500;
    return reply.status(statusCode).send({ error: normalizedError.message });
  });

  app.get("/api/v1/health", async () => deps.health());

  app.post(
    "/api/v1/edge/sync",
    {
      preHandler: requireExtensionToken(deps.extensionToken),
      // Full Edge trees can be much larger than Fastify's 1 MiB default.
      bodyLimit: 64 * 1024 * 1024
    },
    async (request) => {
      const { nodes } = edgeSyncSchema.parse(request.body);
      const result = await requireRepo().syncEdgeTree(nodes);
      if (deps.queue) {
        await Promise.all(
          result.bookmarkIds.map((bookmarkId) =>
            deps.queue!.send(CAPTURE_QUEUE, { bookmarkId })
          )
        );
      }
      await refreshIndex(result.affectedBookmarkIds);
      return result;
    }
  );

  app.post(
    "/api/v1/edge/events",
    { preHandler: requireExtensionToken(deps.extensionToken) },
    async (request) => {
      const event = edgeEventSchema.parse(request.body);
      const result = await requireRepo().applyEdgeEvent(event);
      if (result.bookmarkId && event.type !== "removed" && deps.queue)
        await deps.queue.send(CAPTURE_QUEUE, { bookmarkId: result.bookmarkId });
      await refreshIndex(result.affectedBookmarkIds);
      return { bookmarkId: result.bookmarkId ?? null };
    }
  );

  app.post(
    "/api/v1/captures",
    {
      preHandler: requireExtensionToken(deps.extensionToken),
      // 500k Unicode code points can approach 2 MB in UTF-8 plus JSON overhead.
      bodyLimit: 2_500_000
    },
    async (request, reply) => {
      const payload = capturePayloadSchema.parse(request.body);
      const bookmarkId = await requireRepo().saveCapture(payload);
      if (deps.queue) {
        await deps.queue.send(INDEX_QUEUE, { bookmarkId });
        await deps.queue.send(TAG_QUEUE, { bookmarkId });
      }
      return reply.status(201).send({ bookmarkId });
    }
  );

  app.get("/api/v1/bookmarks", async () => requireRepo().list());
  app.post("/api/v1/bookmarks", async (request, reply) => {
    const payload = createBookmarkSchema.parse(request.body);
    const bookmarkId = await requireRepo().createLocal(
      payload.url,
      payload.title,
      payload.note
    );
    if (deps.queue) await deps.queue.send(CAPTURE_QUEUE, { bookmarkId });
    return reply.status(201).send({ bookmarkId });
  });
  app.get("/api/v1/bookmarks/:id", async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const bookmark = await requireRepo().get(id);
    return bookmark
      ? bookmark
      : reply.status(404).send({ error: "书签不存在" });
  });
  app.patch("/api/v1/bookmarks/:id", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    await requireRepo().patch(id, bookmarkPatchSchema.parse(request.body));
    await refreshIndex([id]);
    return { ok: true };
  });
  app.delete("/api/v1/bookmarks/:id", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    await requireRepo().remove(id);
    if (deps.searchIndex) await deps.searchIndex.remove(id);
    else await refreshIndex([id]);
    return { ok: true };
  });
  app.post("/api/v1/bookmarks/:id/recapture", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    await requireRepo().markCaptureState(id, "pending");
    if (deps.queue) await deps.queue.send(CAPTURE_QUEUE, { bookmarkId: id });
    return { ok: true };
  });

  app.get(
    "/api/v1/search",
    { preHandler: protectExtensionRead },
    async (request) => {
      if (!deps.searchService)
        throw Object.assign(new Error("搜索服务未配置"), { statusCode: 503 });
      return deps.searchService.search(searchQuerySchema.parse(request.query));
    }
  );

  app.get("/api/v1/tags", async () => requireRepo().listTags());
  app.post("/api/v1/tags", async (request, reply) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(50) })
      .parse(request.body);
    return reply.status(201).send(await requireRepo().createTag(name));
  });
  app.delete("/api/v1/tags/:id", async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const affectedBookmarkIds = await requireRepo().deleteTag(id);
    await refreshIndex(affectedBookmarkIds);
    return { ok: true };
  });

  app.post("/api/v1/tag-suggestions/:id/:decision", async (request) => {
    if (!deps.tagSuggestions)
      throw Object.assign(new Error("标签建议服务未配置"), { statusCode: 503 });
    const parameters = z
      .object({
        id: z.uuid(),
        decision: z.enum(["accepted", "rejected"])
      })
      .parse(request.params);
    const bookmarkId = await deps.tagSuggestions.resolve(
      parameters.id,
      parameters.decision
    );
    await refreshIndex([bookmarkId]);
    return { ok: true, bookmarkId };
  });

  return app;
}
