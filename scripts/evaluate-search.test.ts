import { describe, expect, it } from "vitest";
import { calculateHitMetrics } from "./evaluate-search.js";

describe("search evaluation metrics", () => {
  it("calculates Hit@1, Hit@5 and Hit@10 from ranked URLs", () => {
    const metrics = calculateHitMetrics([
      { expectedUrl: "https://a.test", rankedUrls: ["https://a.test"] },
      { expectedUrl: "https://b.test", rankedUrls: ["https://x.test", "https://b.test"] },
      { expectedUrl: "https://c.test", rankedUrls: Array.from({ length: 6 }, (_, index) => index === 5 ? "https://c.test" : `https://${index}.test`) },
      { expectedUrl: "https://missing.test", rankedUrls: [] }
    ]);
    expect(metrics).toEqual({ total: 4, hitAt1: 0.25, hitAt5: 0.5, hitAt10: 0.75 });
  });
});
