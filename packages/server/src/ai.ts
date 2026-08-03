import type { ZodType } from "zod";

export function parseModelJson<T>(content: string, schema: ZodType<T>): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1];
  const parsed: unknown = JSON.parse(fenced ?? content);
  return schema.parse(parsed);
}

export interface AiClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class OpenAiCompatibleClient {
  readonly #config: AiClientConfig;

  constructor(config: AiClientConfig) {
    this.#config = config;
  }

  async generate<T>(prompt: string, schema: ZodType<T>): Promise<T> {
    const fetcher = this.#config.fetcher ?? fetch;
    const response = await fetcher(
      `${this.#config.baseUrl.replace(/\/$/u, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.#config.model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: "只返回符合要求的 JSON，不要添加解释或 Markdown。"
            },
            { role: "user", content: prompt }
          ]
        }),
        signal: AbortSignal.timeout(this.#config.timeoutMs ?? 15_000)
      }
    );
    if (!response.ok) throw new Error(`AI 请求失败：HTTP ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 响应缺少 message.content");
    return parseModelJson(content, schema);
  }
}

export function createAiClientFromEnv(): OpenAiCompatibleClient | undefined {
  const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) return undefined;
  return new OpenAiCompatibleClient({
    baseUrl: AI_BASE_URL,
    apiKey: AI_API_KEY,
    model: AI_MODEL,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || "15000")
  });
}
