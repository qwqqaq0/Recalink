import { randomUUID } from "node:crypto";
import pg from "pg";
import { requireEmptySmokeDatabase } from "./smoke-safety.js";

const apiUrl = (process.env.SMOKE_API_URL ?? "http://127.0.0.1:3210").replace(
  /\/$/u,
  ""
);
const token = process.env.EXTENSION_API_TOKEN ?? "change-this-extension-token";
const databaseUrl = process.env.DATABASE_URL;

async function request<T>(
  path: string,
  init?: RequestInit,
  authenticated = false
): Promise<T> {
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
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

async function eventually<T>(
  operation: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  timeoutMs = 20_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await operation();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`${message}；最后结果：${JSON.stringify(last)}`);
}

interface SearchResponse {
  items: Array<{ id: string; url: string; snippet: string }>;
  meta: { aiApplied: boolean; aiFallbackReason?: string };
}

async function main() {
  await requireEmptySmokeDatabase();
  const suffix = randomUUID().slice(0, 8);
  const marker = `recall-unique-${suffix}`;
  const externalId = `smoke-bookmark-${suffix}`;
  const url = `https://smoke.invalid/${suffix}`;

  const health = await request<{
    database: boolean;
    search: boolean;
    worker: boolean;
    ai: boolean;
  }>("/health");
  assert(
    health.database && health.search && health.worker,
    `依赖健康检查失败：${JSON.stringify(health)}`
  );

  const sync = await request<{ bookmarks: number; folders: number }>(
    "/edge/sync",
    {
      method: "POST",
      body: JSON.stringify({
        nodes: [
          {
            id: "0",
            title: "root",
            children: [
              {
                id: `folder-a-${suffix}`,
                parentId: "0",
                title: "技术",
                children: [
                  {
                    id: externalId,
                    parentId: `folder-a-${suffix}`,
                    title: "合成页面",
                    url
                  }
                ]
              },
              {
                id: `folder-b-${suffix}`,
                parentId: "0",
                title: "稍后",
                children: []
              }
            ]
          }
        ]
      })
    },
    true
  );
  assert(
    sync.bookmarks === 1 && sync.folders === 2,
    `Edge 全量同步计数异常：${JSON.stringify(sync)}`
  );

  await new Promise((resolve) => setTimeout(resolve, 700));
  const capture = await request<{ bookmarkId: string }>(
    "/captures",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        title: "PostgreSQL 合成查询计划",
        description: "烟雾测试页面",
        plainText: `这是一段中文技术正文。只有这里出现唯一术语 ${marker}，并讨论 sequential scan 与索引选择。`,
        headings: ["查询优化", "执行计划"],
        language: "zh-CN",
        sourceBookmarkId: externalId,
        folderExternalId: `folder-a-${suffix}`
      })
    },
    true
  );

  const found = await eventually(
    () =>
      request<SearchResponse>(
        `/search?q=${encodeURIComponent(marker)}&ai=false&limit=10`
      ),
    (result) => result.items[0]?.id === capture.bookmarkId,
    "正文唯一术语未将目标书签排到第一位"
  );
  assert(
    found.items[0]?.snippet.includes(marker),
    "搜索结果未返回包含唯一术语的正文片段"
  );

  const aiFallback = await request<SearchResponse>(
    `/search?q=${encodeURIComponent(marker)}&ai=true&limit=10`
  );
  assert(
    !aiFallback.meta.aiApplied && Boolean(aiFallback.meta.aiFallbackReason),
    "AI 未配置时没有明确降级到普通搜索"
  );
  assert(
    aiFallback.items[0]?.id === capture.bookmarkId,
    "AI 降级后改变了普通搜索首位结果"
  );

  const before = await request<{ sources: Array<{ folderId: string | null }> }>(
    `/bookmarks/${capture.bookmarkId}`
  );
  await request(
    "/edge/events",
    {
      method: "POST",
      body: JSON.stringify({
        type: "changed",
        node: {
          id: externalId,
          parentId: `folder-a-${suffix}`,
          title: "更新后的来源标题",
          url
        }
      })
    },
    true
  );
  await request(
    "/edge/events",
    {
      method: "POST",
      body: JSON.stringify({
        type: "moved",
        node: {
          id: externalId,
          parentId: `folder-b-${suffix}`,
          title: "更新后的来源标题",
          url
        }
      })
    },
    true
  );
  const after = await request<{
    sources: Array<{ folderId: string | null; sourceTitle: string }>;
  }>(`/bookmarks/${capture.bookmarkId}`);
  assert(
    after.sources[0]?.sourceTitle === "更新后的来源标题",
    "Edge 修改事件未更新来源标题"
  );
  assert(
    after.sources[0]?.folderId !== before.sources[0]?.folderId,
    "Edge 移动事件未更新文件夹"
  );

  assert(databaseUrl, "烟雾测试缺少 DATABASE_URL，无法验证待确认标签");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const suggestedName = `待确认-${suffix}`;
  const suggestionId = randomUUID();
  try {
    await pool.query(
      "insert into ai_tag_suggestions (id, bookmark_id, suggested_name, reason) values ($1, $2, $3, $4)",
      [suggestionId, capture.bookmarkId, suggestedName, "合成 AI 建议"]
    );
    const beforeAccept = await request<Array<{ name: string }>>("/tags");
    assert(
      !beforeAccept.some((tag) => tag.name === suggestedName),
      "未经确认的 AI 新标签提前进入正式标签"
    );
    await request(`/tag-suggestions/${suggestionId}/accepted`, {
      method: "POST"
    });
    const afterAccept = await request<Array<{ name: string }>>("/tags");
    assert(
      afterAccept.some((tag) => tag.name === suggestedName),
      "接受 AI 新标签后未创建正式标签"
    );
  } finally {
    await pool.end();
  }

  await request(
    "/edge/events",
    {
      method: "POST",
      body: JSON.stringify({ type: "removed", id: externalId })
    },
    true
  );
  await eventually(
    () =>
      request<SearchResponse>(
        `/search?q=${encodeURIComponent(marker)}&ai=false&limit=10`
      ),
    (result) => !result.items.some((item) => item.id === capture.bookmarkId),
    "Edge 删除事件后书签仍留在搜索索引"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        marker,
        checks: [
          "health",
          "edge-sync",
          "capture",
          "full-text-snippet",
          "ai-fallback",
          "edge-change-move-remove",
          "tag-confirmation"
        ]
      },
      null,
      2
    )
  );
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
