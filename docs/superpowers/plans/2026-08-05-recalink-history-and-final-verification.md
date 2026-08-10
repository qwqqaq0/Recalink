# Recalink History and Final Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the local Recalink Alpha is safe to review publicly, create a recoverable repository backup, rewrite only the maintainer's private commit email, and stop without creating or pushing a remote.

**Architecture:** Finish and commit every content change before touching history. Record the pre-rewrite tree and HEAD, create and verify a full Git bundle outside the repository, perform one email-only history rewrite, delete filter backup refs only after validating the bundle, and compare tree hashes to prove file content did not change.

**Tech Stack:** Git, PowerShell, npm, Docker Compose, TypeScript smoke scripts

---

## Preconditions

Execute this plan only after the bookmark-title, brand/documentation, and extension/CI plans are complete and committed. This plan deliberately contains no product code changes and must be the final local-publication phase.

The approved public identity is:

```text
qwqqaq0 <174874143+qwqqaq0@users.noreply.github.com>
```

The old private address must be discovered from local history at execution time. Do not copy it into a tracked file, commit message, tag, or plan result.

### Task 1: Establish the final content baseline

**Files:**

- Verify: all tracked files

- [ ] **Step 1: Confirm branch, remote, and clean state**

Run:

```powershell
git branch --show-current
git remote -v
git status --short
```

Expected:

- branch is `recalink/public-alpha`;
- `git remote -v` prints nothing;
- `git status --short` prints nothing.

Stop if there is an uncommitted file or any remote. Do not silently discard changes or remove a remote.

- [ ] **Step 2: Record immutable pre-rewrite facts in local Git config**

Run:

```powershell
git config recalink.preRewriteHead (git rev-parse HEAD)
git config recalink.preRewriteTree (git rev-parse "HEAD^{tree}")
git config recalink.preRewriteBranch (git branch --show-current)
git config recalink.preRewriteCommitCount (git rev-list --count --branches --tags)
git config --get-regexp "^recalink\.preRewrite"
```

Expected: HEAD, root tree hash, current public-preparation branch, and the commit count reachable from local branches and tags are printed. These settings live only in `.git/config` and are not committed.

- [ ] **Step 3: Run the full repository verification**

Run:

```powershell
npm ci
npm run verify
npm audit --audit-level=low
```

Expected: all commands exit 0.

### Task 2: Run the Docker synthetic smoke test

**Files:**

- Verify: `docker-compose.yml`
- Verify: `scripts/smoke-test.ts`

- [ ] **Step 1: Build and start the local stack**

Run:

```powershell
docker compose up -d --build
docker compose ps
```

Expected: postgres, meilisearch, api, and worker are healthy. The API is bound to `127.0.0.1` only.

- [ ] **Step 2: Run the synthetic closed-loop smoke test**

Run:

```powershell
docker compose exec -T api node --import tsx scripts/smoke-test.ts
```

Expected: the script confirms synthetic Edge import, body-only unique-term Hit@1 with snippet, event updates, AI failure fallback, rerank candidate containment, and tag confirmation gating.

- [ ] **Step 3: Stop services without deleting data**

Run:

```powershell
docker compose down
```

Expected: containers and network stop; no `-v` flag is used, so named volumes remain.

### Task 3: Scan the tracked public content

**Files:**

- Verify: all tracked files

- [ ] **Step 1: Scan for personal paths, private mail domains, and high-signal secret formats**

Run:

```powershell
$patterns = @(
  [regex]::Escape($env:USERPROFILE),
  [regex]::Escape((Resolve-Path ".").Path),
  "@qq\.com",
  "sk-[A-Za-z0-9_-]{20,}",
  "Bearer [A-Za-z0-9._-]{20,}",
  "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
)
$hits = rg -n --hidden -g "!.git" -g "!node_modules" -g "!dist" -g "!.output" ($patterns -join "|") .
if ($LASTEXITCODE -eq 0) {
  $hits
  throw "Public-content scan found sensitive-looking text"
}
if ($LASTEXITCODE -ne 1) {
  throw "Public-content scan failed to execute"
}
```

Expected: no matches. Generic example values in `.env.example` are allowed only if they are visibly non-secret and do not match these formats.

- [ ] **Step 2: Confirm only documented compatibility names remain**

Run:

```powershell
rg -n --hidden -g "!.git" -g "!node_modules" -g "!dist" -g "!.output" "bookmark-recall|Bookmark Recall" .
```

Expected matches are restricted to:

- Docker/database/key compatibility identifiers;
- extension internal runtime message identifiers;
- historical design and implementation-plan explanations.

Any user-facing runtime string, package name, README instruction, or current product description using the old name must be fixed and re-verified before history rewriting.

- [ ] **Step 3: Confirm ignored private and generated files**

Run:

```powershell
git check-ignore -v .env
git status --short --ignored | Select-String "\.env$|node_modules|\.output|dist"
```

Expected: `.env`, dependencies, builds, and extension output are ignored rather than tracked.

### Task 4: Create and verify the recovery bundle

**Files:**

- Write outside repository: a timestamped `recalink-before-email-rewrite-*.bundle` in the operating-system temporary directory
- Modify locally only: `.git/config`

- [ ] **Step 1: Create a full bundle without overwriting an existing backup**

Run this as one PowerShell block:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundlePath = Join-Path $env:TEMP "recalink-before-email-rewrite-$stamp.bundle"
if (Test-Path -LiteralPath $bundlePath) {
  throw "Refusing to overwrite existing bundle: $bundlePath"
}
git bundle create $bundlePath --all
if ($LASTEXITCODE -ne 0) { throw "git bundle create failed" }
git bundle verify $bundlePath
if ($LASTEXITCODE -ne 0) { throw "git bundle verify failed" }
git config recalink.historyBackupBundle $bundlePath
Write-Output $bundlePath
```

Expected: Git reports that the bundle is valid and its absolute path is printed.

- [ ] **Step 2: Prove the recorded bundle remains readable**

Run:

```powershell
$bundlePath = git config --get recalink.historyBackupBundle
if (-not $bundlePath -or -not (Test-Path -LiteralPath $bundlePath)) {
  throw "Recorded history bundle is missing"
}
git bundle verify $bundlePath
```

Expected: verification succeeds. Do not proceed if the file is absent or invalid.

### Task 5: Set future identity and rewrite existing email metadata

**Files:**

- Modify locally only: `.git/config`
- Rewrite: Git commit objects reachable from local refs

- [ ] **Step 1: Set the repository-local public identity**

Run:

```powershell
git config user.name qwqqaq0
git config user.email 174874143+qwqqaq0@users.noreply.github.com
git config --get user.name
git config --get user.email
```

Expected: the approved name and noreply address are printed. Do not change the user's global Git configuration.

- [ ] **Step 2: Discover exactly one maintainer private address**

Run:

```powershell
$privateEmails = @(
  git log --all --format="%ae%n%ce" |
    Where-Object { $_ -match "@qq\.com$" } |
    Sort-Object -Unique
)
if ($privateEmails.Count -ne 1) {
  throw "Expected exactly one private maintainer email, found $($privateEmails.Count)"
}
Write-Output "One private maintainer address is eligible for rewrite."
```

Expected: the message confirms exactly one address without printing it.

- [ ] **Step 3: Perform one email-only history rewrite**

Run this as one PowerShell block so the private value remains process-local:

```powershell
$bundlePath = git config --get recalink.historyBackupBundle
git bundle verify $bundlePath
if ($LASTEXITCODE -ne 0) { throw "Bundle verification failed" }

$privateEmails = @(
  git log --all --format="%ae%n%ce" |
    Where-Object { $_ -match "@qq\.com$" } |
    Sort-Object -Unique
)
if ($privateEmails.Count -ne 1) {
  throw "Expected exactly one private maintainer email"
}

$env:FILTER_BRANCH_SQUELCH_WARNING = "1"
$env:RECALINK_OLD_EMAIL = $privateEmails[0]
$env:RECALINK_NEW_EMAIL = "174874143+qwqqaq0@users.noreply.github.com"
$filter = @'
if [ "$GIT_AUTHOR_EMAIL" = "$RECALINK_OLD_EMAIL" ]; then
  GIT_AUTHOR_EMAIL="$RECALINK_NEW_EMAIL"
fi
if [ "$GIT_COMMITTER_EMAIL" = "$RECALINK_OLD_EMAIL" ]; then
  GIT_COMMITTER_EMAIL="$RECALINK_NEW_EMAIL"
fi
export GIT_AUTHOR_EMAIL GIT_COMMITTER_EMAIL
'@

git filter-branch --force --env-filter $filter --tag-name-filter cat -- --all
if ($LASTEXITCODE -ne 0) { throw "History rewrite failed" }

Remove-Item Env:RECALINK_OLD_EMAIL
Remove-Item Env:RECALINK_NEW_EMAIL
Remove-Item Env:FILTER_BRANCH_SQUELCH_WARNING
```

Expected: Git rewrites commits reachable from local refs, including `recalink/public-alpha`, while keeping the recorded branch checked out. Commit messages, author names, dates, and file trees remain unchanged; commit hashes change.

- [ ] **Step 4: Compare the rewritten content and commit count before deleting backup refs**

Run:

```powershell
$expectedTree = git config --get recalink.preRewriteTree
$actualTree = git rev-parse "HEAD^{tree}"
if ($actualTree -ne $expectedTree) {
  throw "Tree changed during email-only rewrite"
}
$expectedBranch = git config --get recalink.preRewriteBranch
$actualBranch = git branch --show-current
if ($actualBranch -ne $expectedBranch) {
  throw "Checked-out branch changed during rewrite"
}
$expectedCount = [int](git config --get recalink.preRewriteCommitCount)
$actualCount = [int](git rev-list --count --branches --tags)
if ($actualCount -ne $expectedCount) {
  throw "Commit count changed during rewrite"
}
git log $expectedBranch --format="%an <%ae> | %cn <%ce>" | Sort-Object -Unique
```

Expected: tree hashes and commit counts match, and the maintainer lines use only the noreply address.

### Task 6: Remove obsolete rewrite refs and unreachable private objects

**Files:**

- Delete locally: `refs/original/*` and expired reflog entries
- Preserve outside repository: verified Git bundle

- [ ] **Step 1: Re-verify the external bundle**

Run:

```powershell
$bundlePath = git config --get recalink.historyBackupBundle
git bundle verify $bundlePath
if ($LASTEXITCODE -ne 0) { throw "Recovery bundle is invalid" }
```

Expected: bundle verification succeeds immediately before destructive cleanup.

- [ ] **Step 2: Delete only filter-branch original refs**

Run:

```powershell
$originalRefs = @(git for-each-ref --format="%(refname)" refs/original/)
if ($originalRefs.Count -eq 0) {
  throw "No filter-branch backup refs found; stop and inspect the rewrite"
}
foreach ($ref in $originalRefs) {
  if (-not $ref.StartsWith("refs/original/")) {
    throw "Ref escaped refs/original/: $ref"
  }
  git update-ref -d $ref
  if ($LASTEXITCODE -ne 0) { throw "Failed to delete $ref" }
}
```

Expected: only refs under `refs/original/` are deleted. The recorded `recalink/public-alpha` branch remains checked out and untouched by this cleanup step.

- [ ] **Step 3: Expire reflogs and prune unreachable objects**

Run:

```powershell
git reflog expire --expire=now --all
git gc --prune=now
```

Expected: exit code 0. Recovery remains possible from the external bundle.

- [ ] **Step 4: Confirm private email metadata is no longer reachable**

Run:

```powershell
$privateHistory = git log --all --format="%ae%n%ce" | Select-String "@qq\.com$"
if ($privateHistory) {
  $privateHistory
  throw "Private email remains in reachable history"
}
$originalRefs = git for-each-ref refs/original/
if ($originalRefs) {
  throw "refs/original still exists"
}
```

Expected: no private email and no `refs/original` output.

### Task 7: Perform post-rewrite final verification

**Files:**

- Verify: all tracked files and local Git metadata

- [ ] **Step 1: Prove the final tree still matches**

Run:

```powershell
$before = git config --get recalink.preRewriteTree
$after = git rev-parse "HEAD^{tree}"
if ($before -ne $after) { throw "Final tree does not match pre-rewrite tree" }
Write-Output "Pre-rewrite HEAD: $(git config --get recalink.preRewriteHead)"
Write-Output "Post-rewrite HEAD: $(git rev-parse HEAD)"
Write-Output "Verified tree: $after"
```

Expected: the two HEAD hashes differ and the tree hash matches.

- [ ] **Step 2: Re-run fast post-rewrite checks**

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Expected: every command exits 0. The history rewrite did not modify working files, but this provides fresh evidence against accidental corruption.

- [ ] **Step 3: Confirm local-only handoff state**

Run:

```powershell
git status --short
git remote -v
git config --get user.name
git config --get user.email
git log -5 --oneline
git bundle verify (git config --get recalink.historyBackupBundle)
```

Expected:

- clean working tree;
- no remote output;
- noreply repository-local identity;
- rewritten recent commit hashes;
- valid recovery bundle.

- [ ] **Step 4: Prepare the user handoff without publishing**

Report:

- final local HEAD;
- pre-rewrite HEAD;
- unchanged tree hash;
- verification and Docker smoke results;
- final extension permission set;
- recovery bundle path and the recovery command `git clone <bundle-path> recalink-recovery`;
- confirmation that no remote, push, tag, Release, or plugin-market submission occurred.

Do not create a GitHub repository or run `git push`.
