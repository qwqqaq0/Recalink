import { z } from "zod";

export const httpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "仅支持 HTTP(S) URL");

export const capturePayloadSchema = z.object({
  url: httpUrlSchema,
  title: z.string().trim().max(500),
  description: z.string().max(2_000).default(""),
  plainText: z.string().max(500_000),
  headings: z.array(z.string().trim().max(500)).max(100),
  language: z.string().trim().max(32).default("und"),
  extractionMethod: z
    .enum(["readability", "visible_text"])
    .default("readability"),
  sourceBookmarkId: z.string().trim().max(512).optional(),
  folderExternalId: z.string().trim().max(512).optional()
});
export type CapturePayload = z.infer<typeof capturePayloadSchema>;

export interface EdgeSyncNode {
  id: string;
  parentId?: string | undefined;
  title: string;
  url?: string | undefined;
  dateAdded?: number | undefined;
  children?: EdgeSyncNode[] | undefined;
}

const edgeNodeFields = {
  id: z.string().min(1).max(512),
  parentId: z.string().max(512).optional(),
  title: z.string().max(500),
  // Edge also stores file:, edge: and javascript: entries. They are accepted
  // at the boundary and skipped by the tree flattener instead of aborting sync.
  url: z.string().max(10_000).optional(),
  dateAdded: z.number().nonnegative().optional()
};
export const edgeSyncNodeSchema: z.ZodType<EdgeSyncNode> = z.lazy(() =>
  z.object({
    ...edgeNodeFields,
    children: z.array(edgeSyncNodeSchema).optional()
  })
);
export const edgeSyncSchema = z
  .object({ nodes: z.array(edgeSyncNodeSchema).max(100_000) })
  .superRefine(({ nodes }, context) => {
    const stack = [...nodes];
    let total = 0;
    while (stack.length > 0) {
      const node = stack.pop()!;
      total += 1;
      if (total > 100_000) {
        context.addIssue({
          code: "custom",
          path: ["nodes"],
          message: "Edge 树节点总数不能超过 100,000"
        });
        return;
      }
      if (node.children) stack.push(...node.children);
    }
  });

const edgeUpsertNodeSchema = z.object(edgeNodeFields);
export const edgeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("created"), node: edgeUpsertNodeSchema }),
  z.object({ type: z.literal("changed"), node: edgeUpsertNodeSchema }),
  z.object({ type: z.literal("moved"), node: edgeUpsertNodeSchema }),
  z.object({ type: z.literal("removed"), id: z.string().min(1).max(512) })
]);
export type EdgeEvent = z.infer<typeof edgeEventSchema>;

const queryBoolean = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false || value === undefined) return false;
  return value;
}, z.boolean());
export const searchQuerySchema = z.object({
  q: z.string().trim().max(500).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ai: queryBoolean.default(false),
  folderId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  domain: z.string().trim().max(255).optional(),
  captureStatus: z
    .enum(["pending", "processing", "ready", "metadata_only", "failed"])
    .optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional()
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const aiExpansionSchema = z.object({
  alternateQueries: z.array(z.string().trim().min(1).max(300)).max(3),
  keywords: z.array(z.string().trim().min(1).max(100)).max(8)
});
export type AiExpansion = z.infer<typeof aiExpansionSchema>;
export const aiRerankSchema = z.object({
  results: z
    .array(
      z.object({
        bookmarkId: z.string().min(1),
        reason: z.string().trim().max(300)
      })
    )
    .max(20)
});
export type AiRerank = z.infer<typeof aiRerankSchema>;
export const aiTagResponseSchema = z.object({
  existingTagIds: z.array(z.string().uuid()).max(3),
  newTags: z.array(z.string().trim().min(1).max(50)).max(2),
  reasons: z.record(z.string(), z.string().trim().max(300)).default({})
});
export type AiTagResponse = z.infer<typeof aiTagResponseSchema>;
export const bookmarkPatchSchema = z.object({
  titleOverride: z.string().trim().max(500).nullable().optional(),
  note: z.string().max(10_000).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional()
});
export const createBookmarkSchema = z.object({
  url: httpUrlSchema,
  title: z.string().trim().max(500).default(""),
  note: z.string().max(10_000).default("")
});
