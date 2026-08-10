# Recalink Bookmark Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user review and edit the current page title in the extension popup before creating the Edge bookmark and uploading the capture.

**Architecture:** Put title selection and validation in a small pure helper so it can be tested without a browser. The popup owns the editable state, uses the same validated title for `browser.bookmarks.create()` and the capture payload, and leaves the existing API/database contract unchanged.

**Tech Stack:** TypeScript, React 19, WXT 0.21.3, WebExtension Bookmarks/Tabs APIs, Vitest

---

## File map

- Create: `apps/extension/lib/title.ts` — title fallback, trimming, length limit, empty rejection, and capture-title override.
- Create: `apps/extension/lib/title.test.ts` — pure title behavior tests.
- Modify: `apps/extension/entrypoints/popup/main.tsx` — load current tab title, render editable input, and reuse the final value.
- Modify: `apps/extension/entrypoints/popup/style.css` — spacing for consecutive form labels and the title input.

### Task 1: Record the extension baseline

**Files:**

- Read: `apps/extension/package.json`
- Read: `apps/extension/entrypoints/popup/main.tsx`

- [ ] **Step 1: Install the locked dependencies**

Run:

```powershell
npm ci
```

Expected: exit code 0 and no change to `package-lock.json`.

- [ ] **Step 2: Run the existing extension tests**

Run:

```powershell
npm test --workspace @recalink/extension -- --run
```

Expected: the existing capture and sync suites pass.

- [ ] **Step 3: Run the existing extension typecheck**

Run:

```powershell
npm run typecheck --workspace @recalink/extension
```

Expected: exit code 0.

### Task 2: Add title-domain tests and pure helpers

**Files:**

- Create: `apps/extension/lib/title.test.ts`
- Create: `apps/extension/lib/title.ts`

- [ ] **Step 1: Write the failing title tests**

Create `apps/extension/lib/title.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  MAX_BOOKMARK_TITLE_LENGTH,
  chooseDefaultBookmarkTitle,
  normalizeBookmarkTitle,
  requireBookmarkTitle,
  withBookmarkTitle
} from "./title.js";

describe("bookmark title", () => {
  it("prefers a non-empty tab title", () => {
    expect(
      chooseDefaultBookmarkTitle(
        "  PostgreSQL 查询计划  ",
        "https://example.com"
      )
    ).toBe("PostgreSQL 查询计划");
  });

  it("falls back to the URL when the tab title is missing or blank", () => {
    expect(chooseDefaultBookmarkTitle(undefined, "https://example.com/a")).toBe(
      "https://example.com/a"
    );
    expect(chooseDefaultBookmarkTitle("   ", "https://example.com/b")).toBe(
      "https://example.com/b"
    );
  });

  it("trims and limits the title to the backend contract", () => {
    const value = `${" x ".repeat(MAX_BOOKMARK_TITLE_LENGTH)}`;
    const normalized = normalizeBookmarkTitle(value);
    expect(normalized).toHaveLength(MAX_BOOKMARK_TITLE_LENGTH);
    expect(normalized.startsWith("x")).toBe(true);
  });

  it("rejects an empty final title", () => {
    expect(() => requireBookmarkTitle("   ")).toThrow("书签名称不能为空");
  });

  it("overrides the extracted title without changing the other capture fields", () => {
    expect(
      withBookmarkTitle(
        {
          title: "Readability title",
          url: "https://example.com",
          plainText: "article"
        },
        "  用户标题  "
      )
    ).toEqual({
      title: "用户标题",
      url: "https://example.com",
      plainText: "article"
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npx vitest run apps/extension/lib/title.test.ts
```

Expected: FAIL because `./title.js` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create `apps/extension/lib/title.ts`:

```typescript
export const MAX_BOOKMARK_TITLE_LENGTH = 500;

export function normalizeBookmarkTitle(value: string): string {
  return value.trim().slice(0, MAX_BOOKMARK_TITLE_LENGTH);
}

export function chooseDefaultBookmarkTitle(
  title: string | undefined,
  url: string
): string {
  return normalizeBookmarkTitle(title ?? "") || normalizeBookmarkTitle(url);
}

export function requireBookmarkTitle(value: string): string {
  const title = normalizeBookmarkTitle(value);
  if (!title) throw new Error("书签名称不能为空");
  return title;
}

export function withBookmarkTitle<T extends { title: string }>(
  capture: T,
  title: string
): Omit<T, "title"> & { title: string } {
  return { ...capture, title: requireBookmarkTitle(title) };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx vitest run apps/extension/lib/title.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit the pure title behavior**

Run:

```powershell
git add apps/extension/lib/title.ts apps/extension/lib/title.test.ts
git commit -m "feat(extension): validate bookmark titles"
```

Expected: one commit containing only the helper and its tests.

### Task 3: Add the editable title to the popup

**Files:**

- Modify: `apps/extension/entrypoints/popup/main.tsx`
- Modify: `apps/extension/entrypoints/popup/style.css`

- [ ] **Step 1: Import the title helpers**

Add this import below the client import in `apps/extension/entrypoints/popup/main.tsx`:

```typescript
import {
  chooseDefaultBookmarkTitle,
  normalizeBookmarkTitle,
  requireBookmarkTitle,
  withBookmarkTitle
} from "../../lib/title.js";
```

- [ ] **Step 2: Add editable title state**

Add this state beside `folderId`:

```typescript
const [bookmarkTitle, setBookmarkTitle] = useState("");
```

- [ ] **Step 3: Load the active tab alongside config and folders**

Replace the popup `useEffect` with:

```typescript
useEffect(() => {
  void Promise.all([
    getConfig(),
    browser.bookmarks.getTree(),
    browser.tabs.query({ active: true, currentWindow: true })
  ])
    .then(([config, tree, [tab]]) => {
      setConfigured(Boolean(config.token));
      setFolderId(config.folderId ?? "");
      setFolders(foldersFrom(tree));
      setBookmarkTitle(chooseDefaultBookmarkTitle(tab?.title, tab?.url ?? ""));
      return apiRequest("/health", undefined, false);
    })
    .then(() => setConnected(true))
    .catch(() => setConnected(false));
}, []);
```

- [ ] **Step 4: Make save use one validated final title**

Inside `saveCurrent()`, immediately after the HTTP(S) tab validation, add:

```typescript
const finalTitle = requireBookmarkTitle(bookmarkTitle);
```

After the capture message resolves, add:

```typescript
const titledCapture = withBookmarkTitle(capture, finalTitle);
```

Replace the bookmark title expression with:

```typescript
title: finalTitle,
```

Replace the capture request body with:

```typescript
body: JSON.stringify({
  ...titledCapture,
  sourceBookmarkId: created.id,
  ...(folderId ? { folderExternalId: folderId } : {})
});
```

This ordering is required: `...titledCapture` already contains the user-confirmed title, so no extracted title can overwrite it.

- [ ] **Step 5: Render the title input**

Insert this label between the folder selector label and the save button:

```tsx
<label>
  书签名称
  <input
    aria-label="书签名称"
    maxLength={500}
    value={bookmarkTitle}
    onChange={(event) => setBookmarkTitle(event.target.value)}
    placeholder="输入书签名称"
  />
</label>
```

Change the save button disabled expression to:

```tsx
disabled={
  busy || !configured || !normalizeBookmarkTitle(bookmarkTitle)
}
```

- [ ] **Step 6: Add form spacing**

Append to `apps/extension/entrypoints/popup/style.css`:

```css
section > label + label {
  display: block;
  margin-top: 11px;
}
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
npx vitest run apps/extension/lib/title.test.ts apps/extension/lib/capture.test.ts
npm run typecheck --workspace @recalink/extension
```

Expected: all focused tests pass and typecheck exits 0.

- [ ] **Step 8: Build the extension**

Run:

```powershell
npm run build --workspace @recalink/extension
```

Expected: WXT produces `apps/extension/.output/edge-mv3` without warnings about invalid manifest fields.

- [ ] **Step 9: Commit the popup integration**

Run:

```powershell
git add apps/extension/entrypoints/popup/main.tsx apps/extension/entrypoints/popup/style.css
git commit -m "feat(extension): edit title before saving"
```

Expected: one commit containing the popup behavior and styling.

### Task 4: Verify the end-to-end title contract

**Files:**

- Verify: `apps/extension/.output/edge-mv3`

- [ ] **Step 1: Run all extension tests**

Run:

```powershell
npm test --workspace @recalink/extension -- --run
```

Expected: capture, sync, and title suites pass.

- [ ] **Step 2: Run the repository verification**

Run:

```powershell
npm run verify
```

Expected: format, lint, typecheck, all tests, and all builds pass.

- [ ] **Step 3: Manually verify with a synthetic HTTP page**

Serve a repository fixture or another non-sensitive local HTTP page, load `apps/extension/.output/edge-mv3` in Edge, open the popup, replace the default title with `Recalink 自定义标题验收`, and click the save button.

Expected:

- the Edge bookmark title is `Recalink 自定义标题验收`;
- the Recalink bookmark detail uses the same title;
- the captured body remains searchable;
- reopening the popup reloads the active tab title instead of retaining the prior custom value.

- [ ] **Step 4: Confirm the working tree is clean**

Run:

```powershell
git status --short
```

Expected: no output.
