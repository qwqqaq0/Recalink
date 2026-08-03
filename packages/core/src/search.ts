export interface RerankedItem {
  bookmarkId: string;
  reason: string;
}

export function reciprocalRankFusion(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);
}

export function restrictRerankToCandidates(
  candidates: string[],
  proposed: RerankedItem[]
): RerankedItem[] {
  const allowed = new Set(candidates);
  const seen = new Set<string>();
  const result: RerankedItem[] = [];
  for (const item of proposed) {
    if (allowed.has(item.bookmarkId) && !seen.has(item.bookmarkId)) {
      result.push(item);
      seen.add(item.bookmarkId);
    }
  }
  for (const bookmarkId of candidates) {
    if (!seen.has(bookmarkId)) result.push({ bookmarkId, reason: "" });
  }
  return result;
}
