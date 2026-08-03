import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, restrictRerankToCandidates } from "./search.js";

describe("reciprocalRankFusion", () => {
  it("combines rankings without allowing duplicates", () => {
    const result = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "a", "d"]
    ]);
    expect(result.slice(0, 2)).toEqual(["a", "b"]);
    expect(new Set(result).size).toBe(result.length);
  });
});

describe("restrictRerankToCandidates", () => {
  it("drops invented ids and appends omitted candidates", () => {
    const result = restrictRerankToCandidates(
      ["a", "b", "c"],
      [
        { bookmarkId: "invented", reason: "wrong" },
        { bookmarkId: "c", reason: "best" }
      ]
    );
    expect(result.map((item) => item.bookmarkId)).toEqual(["c", "a", "b"]);
  });
});
