# Recalink Extension and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the extension a reproducible Recalink icon, remove its unused scripting permission, and add public-repository automation and contribution templates.

**Architecture:** Keep one SVG icon source in the extension and let WXT's official auto-icons module generate manifest PNG sizes during builds. Treat the built manifest as the permission test target, while GitHub Actions runs the same root verification command used locally without real secrets or user data.

**Tech Stack:** WXT 0.21.3, @wxt-dev/auto-icons 1.1.x, SVG, npm, GitHub Actions, Node.js 24

---

## File map

- Create: `apps/extension/assets/icon.svg` — source icon.
- Modify: `apps/extension/package.json` and `package-lock.json` — official WXT icon generator.
- Modify: `apps/extension/wxt.config.ts` — auto-icons module and reduced permissions.
- Create: `.github/workflows/verify.yml` — CI verification.
- Create: `.github/ISSUE_TEMPLATE/bug_report.md` — privacy-safe bug reports.
- Create: `.github/ISSUE_TEMPLATE/feature_request.md` — scoped feature proposals.
- Create: `.github/ISSUE_TEMPLATE/config.yml` — disable unstructured public issues.
- Create: `.github/pull_request_template.md` — tests, privacy, and permission review.

### Task 1: Prove that scripting is unused

**Files:**

- Read: `apps/extension`
- Read: `apps/extension/wxt.config.ts`

- [ ] **Step 1: Search extension source for the scripting API**

Run:

```powershell
rg -n "browser\.scripting|chrome\.scripting|executeScript|registerContentScripts" apps/extension
```

Expected: no output. Content extraction is implemented as a declared WXT content script and message listener.

- [ ] **Step 2: Record the current built permission set**

Run:

```powershell
npm run build --workspace @recalink/extension
$manifest = Get-Content -Raw -Encoding utf8 apps/extension/.output/edge-mv3/manifest.json | ConvertFrom-Json
$manifest.permissions
```

Expected before the change: `bookmarks`, `storage`, `activeTab`, and `scripting`.

### Task 2: Add a reproducible Recalink icon

**Files:**

- Create: `apps/extension/assets/icon.svg`
- Modify: `apps/extension/package.json`
- Modify: `package-lock.json`
- Modify: `apps/extension/wxt.config.ts`

- [ ] **Step 1: Install the official WXT icon module**

Run:

```powershell
npm install --save-dev @wxt-dev/auto-icons@^1.1.2 --workspace @recalink/extension
```

Expected: `apps/extension/package.json` lists `@wxt-dev/auto-icons` under devDependencies and `package-lock.json` is updated.

- [ ] **Step 2: Add the SVG source**

Create `apps/extension/assets/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#28683f"/>
  <path
    d="M212 307l-35 35c-31 31-82 31-113 0s-31-82 0-113l60-60c31-31 82-31 113 0 12 12 20 27 22 43"
    fill="none"
    stroke="#fff"
    stroke-width="46"
    stroke-linecap="round"
  />
  <path
    d="M300 205l35-35c31-31 82-31 113 0s31 82 0 113l-60 60c-31 31-82 31-113 0-12-12-20-27-22-43"
    fill="none"
    stroke="#fff"
    stroke-width="46"
    stroke-linecap="round"
  />
  <path
    d="M188 324l136-136"
    fill="none"
    stroke="#fff"
    stroke-width="46"
    stroke-linecap="round"
  />
</svg>
```

The rounded green field matches the existing UI color and the linked strokes express “recall + link” without using a font or third-party asset.

- [ ] **Step 3: Enable auto-icons**

Change the WXT modules line to:

```typescript
modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
autoIcons: {
  baseIconPath: "assets/icon.svg"
},
```

Do not add manual `icons` entries. The explicit `baseIconPath` is required because the module defaults to `assets/icon.png`; WXT 0.21.3 and `@wxt-dev/auto-icons` then generate PNG sizes from the SVG.

- [ ] **Step 4: Build and inspect generated icons**

Run:

```powershell
npm run build --workspace @recalink/extension
$manifest = Get-Content -Raw -Encoding utf8 apps/extension/.output/edge-mv3/manifest.json | ConvertFrom-Json
if (-not $manifest.icons) { throw "WXT did not generate manifest icons" }
$manifest.icons | ConvertTo-Json
```

Expected: the manifest contains multiple PNG icon sizes including a 128px entry, and all referenced files exist under `apps/extension/.output/edge-mv3`.

- [ ] **Step 5: Commit the icon source and generator**

Run:

```powershell
git add apps/extension/assets/icon.svg apps/extension/package.json apps/extension/wxt.config.ts package-lock.json
git commit -m "feat(extension): add Recalink icon"
```

Expected: generated `.output` files remain ignored and are not committed.

### Task 3: Remove the unused permission and test the built manifest

**Files:**

- Modify: `apps/extension/wxt.config.ts`
- Verify: `apps/extension/.output/edge-mv3/manifest.json`

- [ ] **Step 1: Remove scripting from the source manifest**

Set the permissions line to:

```typescript
permissions: ["bookmarks", "storage", "activeTab"],
```

Keep the existing localhost host permissions:

```text
host_permissions: ["http://127.0.0.1/*", "http://localhost/*"]
```

- [ ] **Step 2: Build and enforce the exact permission set**

Run:

```powershell
npm run build --workspace @recalink/extension
$manifest = Get-Content -Raw -Encoding utf8 apps/extension/.output/edge-mv3/manifest.json | ConvertFrom-Json
$actual = @($manifest.permissions | Sort-Object)
$expected = @("activeTab", "bookmarks", "storage")
if (Compare-Object $expected $actual) {
  throw "Unexpected extension permissions: $($actual -join ', ')"
}
if ($manifest.host_permissions -notcontains "http://127.0.0.1/*") {
  throw "Missing 127.0.0.1 host permission"
}
if ($manifest.host_permissions -notcontains "http://localhost/*") {
  throw "Missing localhost host permission"
}
```

Expected: the script exits 0 and `scripting` is absent.

- [ ] **Step 3: Run extension typecheck and tests**

Run:

```powershell
npm run typecheck --workspace @recalink/extension
npm test --workspace @recalink/extension -- --run
```

Expected: all extension checks pass without `scripting`.

- [ ] **Step 4: Commit the permission reduction**

Run:

```powershell
git add apps/extension/wxt.config.ts
git commit -m "security(extension): remove unused scripting permission"
```

Expected: one-file security-focused commit.

### Task 4: Add GitHub Actions verification

**Files:**

- Create: `.github/workflows/verify.yml`

- [ ] **Step 1: Create the verification workflow**

Create `.github/workflows/verify.yml`:

```yaml
name: Verify

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: verify-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm

      - name: Install locked dependencies
        run: npm ci

      - name: Verify
        run: npm run verify

      - name: Audit production-impacting vulnerabilities
        run: npm audit --audit-level=high
```

The workflow intentionally does not start Docker, use real AI keys, or access browser bookmarks. `actions/checkout@v7` and `actions/setup-node@v6` are the current supported major lines selected during planning.

- [ ] **Step 2: Format-check the workflow**

Run:

```powershell
npx prettier --check .github/workflows/verify.yml
```

Expected: the YAML is accepted by Prettier.

- [ ] **Step 3: Re-run the exact CI commands locally**

Run:

```powershell
npm ci
npm run verify
npm audit --audit-level=high
```

Expected: all three commands exit 0 without credentials.

- [ ] **Step 4: Commit the workflow**

Run:

```powershell
git add .github/workflows/verify.yml
git commit -m "ci: verify Recalink on Node 24"
```

Expected: one workflow-only commit.

### Task 5: Add issue and pull request templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Add the bug report template**

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug 报告
about: 报告可复现的 Recalink 问题
title: "[Bug] "
labels: bug
assignees: ""
---

## 问题

请说明实际行为和期望行为。

## 复现步骤

请提供使用合成数据或已脱敏数据的最小复现步骤。

## 环境

- Recalink commit 或版本：
- Windows/macOS/Linux：
- Edge/Chromium 版本：
- Docker Desktop 版本：
- Node.js 版本：

## 验证结果

请粘贴 `npm run verify` 或相关失败命令的摘要。

## 隐私检查

请确认内容中不包含扩展令牌、AI 密钥、真实收藏 URL、网页正文、数据库导出或其他私人信息。安全漏洞请使用仓库 Security 页面的私密报告功能，不要公开提交。
```

- [ ] **Step 2: Add the feature request template**

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: 功能建议
about: 建议一个范围清晰的改进
title: "[Feature] "
labels: enhancement
assignees: ""
---

## 使用场景

请描述你在什么情况下遇到问题，以及当前替代做法。

## 建议行为

请描述最小可用行为和明确的验收结果。

## 数据与权限影响

请说明是否需要新的浏览器权限、外部服务、AI 数据发送、数据库迁移或网络访问；如果不需要，也请明确写出。

## 不包含的范围

请列出这个建议不打算解决的相邻问题，避免范围无界扩大。
```

- [ ] **Step 3: Configure issue creation**

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links: []
```

- [ ] **Step 4: Add the pull request checklist**

Create `.github/pull_request_template.md`:

```markdown
## 变更

请简要说明问题、方案和用户可见结果。

## 验证

- [ ] 已运行 `npm run verify`
- [ ] 涉及 Docker 服务时已运行合成烟雾测试
- [ ] 功能或缺陷修复包含先失败后通过的测试
- [ ] 文档与实际行为一致

## 隐私与安全

- [ ] 未提交令牌、密钥、真实收藏、网页正文或数据库导出
- [ ] 已说明新增或变化的网络请求与数据流向
- [ ] 未增加扩展权限，或已解释必要性和更小权限方案
- [ ] AI 仍为显式启用，故障时不会破坏普通搜索
```

- [ ] **Step 5: Format-check and commit the templates**

Run:

```powershell
npx prettier --check .github
git add .github/ISSUE_TEMPLATE .github/pull_request_template.md
git commit -m "docs: add GitHub contribution templates"
```

Expected: formatting passes and one templates-only commit is created.

### Task 6: Verify the extension and repository automation

**Files:**

- Verify: `apps/extension/.output/edge-mv3/manifest.json`
- Verify: `.github`

- [ ] **Step 1: Run full repository verification**

Run:

```powershell
npm run verify
```

Expected: all checks pass with auto-generated icons and reduced permissions.

- [ ] **Step 2: Inspect ignored build output**

Run:

```powershell
git status --short --ignored apps/extension/.output
```

Expected: generated extension output is marked ignored, not staged.

- [ ] **Step 3: Manually load the production extension**

Reload `apps/extension/.output/edge-mv3` in Edge.

Expected:

- the toolbar and extension management page show the Recalink icon;
- popup, options, full sync, quick search, and explicit capture still work;
- Edge does not list a scripting permission.

- [ ] **Step 4: Confirm the working tree is clean**

Run:

```powershell
git status --short
```

Expected: no output.
