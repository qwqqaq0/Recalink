import { MeiliSearch } from "meilisearch";
import type { SearchBackend, SearchHit, BackendSearchOptions } from "./search-service.js";

export interface BookmarkSearchDocument {
  id: string;
  title: string;
  note: string;
  tagIds: string[];
  tagNames: string[];
  pageTitle: string;
  headings: string[];
  description: string;
  plainText: string;
  url: string;
  domain: string;
  folderIds: string[];
  captureStatus: string;
  createdAtEpoch: number;
}

export class MeiliBookmarkIndex implements SearchBackend {
  readonly client: MeiliSearch;
  readonly indexName: string;

  constructor(host = process.env.MEILI_URL ?? "http://127.0.0.1:7700", apiKey = process.env.MEILI_MASTER_KEY, indexName = "bookmarks") {
    this.client = new MeiliSearch({ host, ...(apiKey ? { apiKey } : {}) });
    this.indexName = indexName;
  }

  async ensure(): Promise<void> {
    const index = this.client.index<BookmarkSearchDocument>(this.indexName);
    const task = await index.updateSettings({
      searchableAttributes: ["title", "note", "tagNames", "pageTitle", "headings", "description", "plainText", "url", "domain"],
      filterableAttributes: ["folderIds", "tagIds", "domain", "captureStatus", "createdAtEpoch"],
      displayedAttributes: ["id", "title", "url", "domain", "plainText", "captureStatus"]
    });
    await this.client.tasks.waitForTask(task);
  }

  async put(document: BookmarkSearchDocument): Promise<void> {
    const task = await this.client.index<BookmarkSearchDocument>(this.indexName).addDocuments([document], { primaryKey: "id" });
    await this.client.tasks.waitForTask(task);
  }

  async remove(id: string): Promise<void> {
    const task = await this.client.index(this.indexName).deleteDocument(id);
    await this.client.tasks.waitForTask(task);
  }

  async search(query: string, options: BackendSearchOptions = { page: 1, limit: 20 }): Promise<SearchHit[]> {
    const filters: string[] = [];
    if (options.folderId) filters.push(`folderIds = ${JSON.stringify(options.folderId)}`);
    if (options.tagIds?.length) filters.push(`tagIds IN [${options.tagIds.map((id) => JSON.stringify(id)).join(",")}]`);
    if (options.domain) filters.push(`domain = ${JSON.stringify(options.domain)}`);
    if (options.captureStatus) filters.push(`captureStatus = ${JSON.stringify(options.captureStatus)}`);
    if (options.createdFrom) filters.push(`createdAtEpoch >= ${new Date(options.createdFrom).getTime()}`);
    if (options.createdTo) filters.push(`createdAtEpoch <= ${new Date(options.createdTo).getTime()}`);

    const result = await this.client.index<BookmarkSearchDocument>(this.indexName).search(query, {
      offset: (options.page - 1) * options.limit,
      limit: options.limit,
      ...(filters.length ? { filter: filters } : {}),
      attributesToCrop: ["plainText:40"],
      cropMarker: "…",
      attributesToHighlight: [],
      showMatchesPosition: true
    });

    return result.hits.map((hit: any) => ({
      id: hit.id,
      title: hit.title,
      url: hit.url,
      domain: hit.domain,
      snippet: hit._formatted?.plainText ?? hit.plainText?.slice(0, 300) ?? "",
      matchedFields: Object.keys(hit._matchesPosition ?? {}),
      matchedTerms: query.split(/\s+/u).filter(Boolean)
    }));
  }
}
