export const MAX_BOOKMARK_TITLE_LENGTH = 500;

export function normalizeBookmarkTitle(value: string): string {
  return value.trim().slice(0, MAX_BOOKMARK_TITLE_LENGTH);
}

export function chooseDefaultBookmarkTitle(
  title: string | undefined,
  url: string
): string {
  const normalizedTitle = title ? normalizeBookmarkTitle(title) : "";
  return normalizedTitle || normalizeBookmarkTitle(url);
}

export function requireBookmarkTitle(value: string): string {
  const title = normalizeBookmarkTitle(value);

  if (!title) {
    throw new Error("书签名称不能为空");
  }

  return title;
}

export function withBookmarkTitle<T extends { title: string }>(
  capture: T,
  title: string
): Omit<T, "title"> & { title: string } {
  return { ...capture, title: requireBookmarkTitle(title) };
}
