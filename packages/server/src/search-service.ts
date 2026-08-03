import {
  reciprocalRankFusion,
  restrictRerankToCandidates
} from "@bookmark-recall/core";
import type { AiExpansion } from "@bookmark-recall/contracts";

export interface SearchHit {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  matchedFields: string[];
  matchedTerms: string[];
  aiReason?: string;
}

export interface BackendSearchOptions {
  page: number;
  limit: number;
  folderId?: string | undefined;
  tagIds?: string[] | undefined;
  domain?: string | undefined;
  captureStatus?: string | undefined;
  createdFrom?: string | undefined;
  createdTo?: string | undefined;
}

export interface SearchBackend {
  search(query: string, options?: BackendSearchOptions): Promise<SearchHit[]>;
}

export interface AiSearchAssistant {
  expand(query: string): Promise<AiExpansion>;
  rerank(
    query: string,
    candidates: SearchHit[]
  ): Promise<Array<{ bookmarkId: string; reason: string }>>;
}

export interface SearchInput extends BackendSearchOptions {
  q: string;
  ai: boolean;
}

export interface SearchResult {
  items: SearchHit[];
  meta: {
    query: string;
    expandedQueries: string[];
    aiApplied: boolean;
    aiFallbackReason?: string;
    tookMs: number;
  };
}

export class SearchService {
  constructor(
    private readonly backend: SearchBackend,
    private readonly ai?: AiSearchAssistant
  ) {}

  async search(input: SearchInput): Promise<SearchResult> {
    const startedAt = performance.now();
    const basic = await this.backend.search(input.q, input);
    if (!input.ai) {
      return this.result(input.q, basic, [], false, startedAt);
    }
    if (!this.ai) {
      return this.result(input.q, basic, [], false, startedAt, "AI未配置");
    }

    try {
      const expansion = await this.ai.expand(input.q);
      const expandedQueries = expansion.alternateQueries.slice(0, 3);
      const rankings: string[][] = [basic.map((item) => item.id)];
      const byId = new Map(basic.map((item) => [item.id, item]));
      for (const query of expandedQueries) {
        const hits = await this.backend.search(query, {
          ...input,
          page: 1,
          limit: 30
        });
        rankings.push(hits.map((item) => item.id));
        for (const hit of hits) byId.set(hit.id, hit);
      }
      const fusedIds = reciprocalRankFusion(rankings).slice(0, 20);
      const candidates = fusedIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
      const proposed = await this.ai.rerank(input.q, candidates);
      const safeOrder = restrictRerankToCandidates(fusedIds, proposed);
      const items = safeOrder.flatMap((item) => {
        const hit = byId.get(item.bookmarkId);
        return hit
          ? [{ ...hit, ...(item.reason ? { aiReason: item.reason } : {}) }]
          : [];
      });
      return this.result(input.q, items, expandedQueries, true, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI调用失败";
      return this.result(input.q, basic, [], false, startedAt, message);
    }
  }

  private result(
    query: string,
    items: SearchHit[],
    expandedQueries: string[],
    aiApplied: boolean,
    startedAt: number,
    aiFallbackReason?: string
  ): SearchResult {
    return {
      items,
      meta: {
        query,
        expandedQueries,
        aiApplied,
        ...(aiFallbackReason ? { aiFallbackReason } : {}),
        tookMs: Math.round(performance.now() - startedAt)
      }
    };
  }
}
