export interface Tag {
  id: string;
  name: string;
  createdBy?: "manual" | "ai";
}

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

export interface SearchResponse {
  items: SearchHit[];
  meta: {
    query: string;
    expandedQueries: string[];
    aiApplied: boolean;
    aiFallbackReason?: string;
    tookMs: number;
  };
}

export interface Health {
  database: boolean;
  search: boolean;
  worker: boolean;
  ai: boolean;
}

export interface Suggestion {
  id: string;
  existingTagId: string | null;
  suggestedName: string | null;
  reason: string;
  status: "pending" | "accepted" | "rejected";
}

export interface BookmarkDetail {
  id: string;
  url: string;
  title: string;
  titleOverride: string | null;
  note: string;
  domain: string;
  description: string;
  captureStatus: string;
  lastError: string | null;
  tags: Tag[];
  suggestions: Suggestion[];
  content?: {
    plainText: string;
    headings: string[];
    extractionMethod: string;
  } | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),
  tags: () => request<Tag[]>("/tags"),
  createTag: (name: string) =>
    request<Tag>("/tags", { method: "POST", body: JSON.stringify({ name }) }),
  deleteTag: (id: string) =>
    request<{ ok: true }>(`/tags/${id}`, { method: "DELETE" }),
  search: (params: URLSearchParams) =>
    request<SearchResponse>(`/search?${params.toString()}`),
  bookmark: (id: string) => request<BookmarkDetail>(`/bookmarks/${id}`),
  updateBookmark: (
    id: string,
    body: { titleOverride: string | null; note: string; tagIds: string[] }
  ) =>
    request<{ ok: true }>(`/bookmarks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  removeBookmark: (id: string) =>
    request<{ ok: true }>(`/bookmarks/${id}`, { method: "DELETE" }),
  recapture: (id: string) =>
    request<{ ok: true }>(`/bookmarks/${id}/recapture`, { method: "POST" }),
  resolveSuggestion: (id: string, decision: "accepted" | "rejected") =>
    request<{ ok: true }>(`/tag-suggestions/${id}/${decision}`, {
      method: "POST"
    })
};
