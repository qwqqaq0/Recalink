import { eq } from "drizzle-orm";
import { aiTagResponseSchema } from "@bookmark-recall/contracts";
import { aiTagSuggestions, bookmarkTags, bookmarks, tags, type Database } from "@bookmark-recall/db";
import { OpenAiCompatibleClient } from "./ai.js";

export class TagSuggestionRepository {
  constructor(private readonly db: Database) {}

  async profiles() {
    const tagRows = await this.db.select().from(tags);
    return Promise.all(tagRows.map(async (tag) => {
      const samples = await this.db.select({ title: bookmarks.title, description: bookmarks.description })
        .from(bookmarkTags).innerJoin(bookmarks, eq(bookmarkTags.bookmarkId, bookmarks.id))
        .where(eq(bookmarkTags.tagId, tag.id)).limit(10);
      return { id: tag.id, name: tag.name, samples };
    }));
  }

  async replace(bookmarkId: string, response: { existingTagIds: string[]; newTags: string[]; reasons: Record<string, string> }) {
    await this.db.transaction(async (tx) => {
      await tx.delete(aiTagSuggestions).where(eq(aiTagSuggestions.bookmarkId, bookmarkId));
      const values = [
        ...response.existingTagIds.map((existingTagId) => ({
          bookmarkId, existingTagId, reason: response.reasons[existingTagId] ?? ""
        })),
        ...response.newTags.map((suggestedName) => ({
          bookmarkId, suggestedName, reason: response.reasons[suggestedName] ?? ""
        }))
      ];
      if (values.length) await tx.insert(aiTagSuggestions).values(values);
    });
  }

  async resolve(id: string, decision: "accepted" | "rejected"): Promise<string> {
    const suggestion = await this.db.query.aiTagSuggestions.findFirst({ where: eq(aiTagSuggestions.id, id) });
    if (!suggestion) throw Object.assign(new Error("标签建议不存在"), { statusCode: 404 });
    if (decision === "accepted") {
      let tagId = suggestion.existingTagId;
      if (!tagId && suggestion.suggestedName) {
        const normalizedName = suggestion.suggestedName.trim().toLocaleLowerCase("zh-CN");
        const [created] = await this.db.insert(tags).values({
          name: suggestion.suggestedName.trim(), normalizedName, createdBy: "ai"
        }).onConflictDoUpdate({ target: tags.normalizedName, set: { updatedAt: new Date() } }).returning({ id: tags.id });
        tagId = created?.id ?? null;
      }
      if (tagId) {
        await this.db.insert(bookmarkTags).values({ bookmarkId: suggestion.bookmarkId, tagId })
          .onConflictDoNothing();
      }
    }
    await this.db.update(aiTagSuggestions).set({ status: decision, updatedAt: new Date() })
      .where(eq(aiTagSuggestions.id, id));
    return suggestion.bookmarkId;
  }
}

export class LlmTagSuggester {
  constructor(
    private readonly client: OpenAiCompatibleClient,
    private readonly repository: TagSuggestionRepository
  ) {}

  async suggest(bookmark: { id: string; title: string; description: string; content?: { headings: string[]; plainText: string } | undefined }) {
    const profiles = await this.repository.profiles();
    const compactProfiles = profiles.map((profile) => ({
      id: profile.id, name: profile.name,
      examples: profile.samples.map((sample) => sample.title).filter(Boolean)
    }));
    const response = await this.client.generate(
      `为书签建议主题标签。优先选择已有标签，允许空结果；最多3个existingTagIds和2个newTags。不要自动应用。\n书签：${JSON.stringify({ title: bookmark.title, description: bookmark.description, headings: bookmark.content?.headings, excerpt: bookmark.content?.plainText.slice(0, 3000) })}\n已有标签档案：${JSON.stringify(compactProfiles)}\n返回：{"existingTagIds":[],"newTags":[],"reasons":{}}`,
      aiTagResponseSchema
    );
    const allowed = new Set(profiles.map((profile) => profile.id));
    await this.repository.replace(bookmark.id, {
      ...response,
      existingTagIds: response.existingTagIds.filter((id) => allowed.has(id))
    });
  }
}
