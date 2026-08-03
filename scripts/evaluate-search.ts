import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface EvaluationObservation {
  expectedUrl: string;
  rankedUrls: string[];
}
export interface HitMetrics {
  total: number;
  hitAt1: number;
  hitAt5: number;
  hitAt10: number;
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return value.replace(/\/$/u, "");
  }
}

export function calculateHitMetrics(
  observations: EvaluationObservation[]
): HitMetrics {
  const total = observations.length;
  const hit = (limit: number) =>
    total === 0
      ? 0
      : observations.filter((item) =>
          item.rankedUrls
            .slice(0, limit)
            .some(
              (url) => comparableUrl(url) === comparableUrl(item.expectedUrl)
            )
        ).length / total;
  return { total, hitAt1: hit(1), hitAt5: hit(5), hitAt10: hit(10) };
}

interface EvaluationCase {
  query: string;
  expectedUrl: string;
}

function parseDataset(text: string): EvaluationCase[] {
  const trimmed = text.trim();
  const parsed: unknown = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : trimmed
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  if (!Array.isArray(parsed))
    throw new Error("评估数据必须是 JSON 数组或 JSONL");
  return parsed.map((item, index) => {
    const candidate = item as Partial<EvaluationCase>;
    if (
      typeof candidate.query !== "string" ||
      typeof candidate.expectedUrl !== "string"
    )
      throw new Error(`第 ${index + 1} 条数据缺少 query 或 expectedUrl`);
    return { query: candidate.query, expectedUrl: candidate.expectedUrl };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file)
    throw new Error(
      "用法：npm run eval:search -- <dataset.json|jsonl> [--ai] [--api=http://127.0.0.1:3210]"
    );
  const ai = args.includes("--ai");
  const apiUrl =
    args.find((arg) => arg.startsWith("--api="))?.slice(6) ??
    "http://127.0.0.1:3210";
  const cases = parseDataset(await readFile(resolve(file), "utf8"));
  const observations: EvaluationObservation[] = [];
  for (const item of cases) {
    const response = await fetch(
      `${apiUrl.replace(/\/$/u, "")}/api/v1/search?q=${encodeURIComponent(item.query)}&ai=${ai}&limit=10`
    );
    if (!response.ok)
      throw new Error(`查询“${item.query}”失败：HTTP ${response.status}`);
    const payload = (await response.json()) as {
      items: Array<{ url: string }>;
    };
    observations.push({
      expectedUrl: item.expectedUrl,
      rankedUrls: payload.items.map((hit) => hit.url)
    });
  }
  const metrics = calculateHitMetrics(observations);
  console.table([
    {
      mode: ai ? "AI" : "普通",
      queries: metrics.total,
      "Hit@1": metrics.hitAt1.toFixed(3),
      "Hit@5": metrics.hitAt5.toFixed(3),
      "Hit@10": metrics.hitAt10.toFixed(3)
    }
  ]);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
