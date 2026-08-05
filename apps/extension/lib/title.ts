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

interface BookmarkTitleTab {
  title?: string | undefined;
  url?: string | undefined;
}

export async function loadDefaultBookmarkTitle(
  queryActiveTabs: () => Promise<BookmarkTitleTab[]>
): Promise<string> {
  try {
    const [tab] = await queryActiveTabs();
    return chooseDefaultBookmarkTitle(tab?.title, tab?.url ?? "");
  } catch {
    return "";
  }
}

export function applyDefaultBookmarkTitle(
  currentTitle: string,
  defaultTitle: string,
  edited: boolean
): string {
  return edited ? currentTitle : defaultTitle;
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
