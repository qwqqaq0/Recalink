import { aiExpansionSchema, aiRerankSchema } from "@bookmark-recall/contracts";
import type { AiSearchAssistant, SearchHit } from "./search-service.js";
import { OpenAiCompatibleClient } from "./ai.js";

export class LlmSearchAssistant implements AiSearchAssistant {
  constructor(private readonly client: OpenAiCompatibleClient) {}

  expand(query: string) {
    return this.client.generate(
      `把以下书签搜索请求扩展为更适合全文检索的表达。保留原意，补充中英文术语和缩写。\n查询：${query}\n返回：{"alternateQueries":string[最多3项],"keywords":string[最多8项]}`,
      aiExpansionSchema
    );
  }

  async rerank(query: string, candidates: SearchHit[]) {
    const compact = candidates.map(({ id, title, domain, snippet }) => ({
      id,
      title,
      domain,
      snippet
    }));
    const result = await this.client.generate(
      `根据用户查询重排候选书签。只能使用候选中的id，可省略不相关项。\n查询：${query}\n候选：${JSON.stringify(compact)}\n返回：{"results":[{"bookmarkId":"候选id","reason":"简短中文理由"}]}`,
      aiRerankSchema
    );
    return result.results;
  }
}
