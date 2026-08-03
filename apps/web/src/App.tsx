import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type BookmarkDetail,
  type Health,
  type SearchHit,
  type SearchResponse,
  type Tag
} from "./api.js";
import "./styles.css";

const statusLabels: Record<string, string> = {
  pending: "等待采集",
  processing: "采集中",
  ready: "正文就绪",
  metadata_only: "仅元数据",
  failed: "采集失败"
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`status-dot ${ok ? "ok" : "down"}`} aria-hidden="true" />
  );
}

function EmptyState({ searched }: { searched: boolean }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">⌕</div>
      <h2>{searched ? "没有找到相符的书签" : "从记得的任何线索开始"}</h2>
      <p>
        {searched
          ? "可以缩短关键词、清除筛选，或开启 AI 扩展查询。"
          : "标题、备注、标签和网页正文都会参与检索。"}
      </p>
    </div>
  );
}

function ResultCard({ item, onOpen }: { item: SearchHit; onOpen: () => void }) {
  return (
    <article className="result-card" onClick={onOpen}>
      <div className="result-main">
        <button className="title-button" type="button" onClick={onOpen}>
          {item.title || item.url}
        </button>
        <div className="result-url">{item.domain}</div>
        {item.snippet && <p className="snippet">{item.snippet}</p>}
        {item.aiReason && (
          <p className="ai-reason">
            <span>AI</span>
            {item.aiReason}
          </p>
        )}
        <div className="match-meta">
          {item.matchedFields?.length > 0 && (
            <span>命中 {item.matchedFields.join("、")}</span>
          )}
          {item.matchedTerms?.slice(0, 5).map((term) => (
            <span className="term" key={term}>
              {term}
            </span>
          ))}
        </div>
      </div>
      <a
        className="open-link"
        href={item.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        aria-label={`打开 ${item.title}`}
      >
        ↗
      </a>
    </article>
  );
}

function DetailDrawer({
  id,
  allTags,
  onClose,
  onChanged
}: {
  id: string;
  allTags: Tag[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<BookmarkDetail>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await api.bookmark(id);
    setDetail(next);
    setTitle(next.titleOverride ?? "");
    setNote(next.note);
    setTagIds(next.tags.map((tag) => tag.id));
  }, [id]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await api.updateBookmark(id, {
        titleOverride: title.trim() || null,
        note,
        tagIds
      });
      setMessage("已保存");
      await load();
      await onChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveSuggestion(
    suggestionId: string,
    decision: "accepted" | "rejected"
  ) {
    setBusy(true);
    try {
      await api.resolveSuggestion(suggestionId, decision);
      await load();
      await onChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("仅从 Bookmark Recall 中移除？Edge 原收藏不会被删除。"))
      return;
    setBusy(true);
    try {
      await api.removeBookmark(id);
      await onChanged();
      onClose();
    } catch (error) {
      setMessage((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="drawer"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="书签详情"
      >
        <div className="drawer-head">
          <div>
            <div className="eyebrow">书签详情</div>
            <h2>{detail?.titleOverride || detail?.title || "加载中…"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {!detail ? (
          <div className="drawer-loading">正在读取…</div>
        ) : (
          <div className="drawer-body">
            <a
              className="detail-url"
              href={detail.url}
              target="_blank"
              rel="noreferrer"
            >
              {detail.url} ↗
            </a>
            <div className="capture-line">
              <span className={`pill ${detail.captureStatus}`}>
                {statusLabels[detail.captureStatus] ?? detail.captureStatus}
              </span>
              {detail.lastError && (
                <span className="error-text">{detail.lastError}</span>
              )}
            </div>
            <label>
              本地标题覆盖
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={detail.title}
              />
            </label>
            <label>
              备注
              <textarea
                rows={5}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="写下为什么收藏、以后会用来做什么…"
              />
            </label>
            <fieldset>
              <legend>标签</legend>
              <div className="tag-picker">
                {allTags.length === 0 && (
                  <span className="muted">
                    还没有标签，可在标签管理中创建。
                  </span>
                )}
                {allTags.map((tag) => (
                  <label
                    className={`tag-check ${tagIds.includes(tag.id) ? "selected" : ""}`}
                    key={tag.id}
                  >
                    <input
                      type="checkbox"
                      checked={tagIds.includes(tag.id)}
                      onChange={() =>
                        setTagIds((current) =>
                          current.includes(tag.id)
                            ? current.filter((value) => value !== tag.id)
                            : [...current, tag.id]
                        )
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {detail.suggestions.some((item) => item.status === "pending") && (
              <section className="suggestions">
                <h3>AI 标签建议</h3>
                {detail.suggestions
                  .filter((item) => item.status === "pending")
                  .map((item) => (
                    <div className="suggestion" key={item.id}>
                      <div>
                        <strong>
                          {item.suggestedName ??
                            allTags.find((tag) => tag.id === item.existingTagId)
                              ?.name ??
                            "已有标签"}
                        </strong>
                        <p>{item.reason}</p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            void resolveSuggestion(item.id, "accepted")
                          }
                        >
                          接受
                        </button>
                        <button
                          className="ghost"
                          type="button"
                          onClick={() =>
                            void resolveSuggestion(item.id, "rejected")
                          }
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  ))}
              </section>
            )}
            {detail.content?.plainText && (
              <details className="content-preview">
                <summary>查看已保存正文</summary>
                <pre>{detail.content.plainText.slice(0, 6000)}</pre>
              </details>
            )}
            {message && (
              <p
                className={message === "已保存" ? "success-text" : "error-text"}
              >
                {message}
              </p>
            )}
          </div>
        )}
        <div className="drawer-actions">
          <button
            className="danger ghost"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            从项目移除
          </button>
          <button
            className="ghost"
            type="button"
            disabled={busy}
            onClick={() =>
              void api
                .recapture(id)
                .then(() => setMessage("已加入重新采集队列"))
                .catch((error: Error) => setMessage(error.message))
            }
          >
            重新采集
          </button>
          <button
            className="primary"
            type="button"
            disabled={busy || !detail}
            onClick={() => void save()}
          >
            {busy ? "处理中…" : "保存"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function SettingsPanel({
  health,
  tags,
  reloadTags
}: {
  health: Health | undefined;
  tags: Tag[];
  reloadTags: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function createTag(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createTag(name);
      setName("");
      setError("");
      await reloadTags();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  return (
    <main className="settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">本地服务</div>
          <h1>设置与状态</h1>
        </div>
      </div>
      <section className="settings-card">
        <h2>运行状态</h2>
        <div className="health-grid">
          {(
            [
              ["database", "PostgreSQL"],
              ["search", "Meilisearch"],
              ["worker", "后台任务"],
              ["ai", "AI 服务"]
            ] as const
          ).map(([key, label]) => (
            <div className="health-item" key={key}>
              <StatusDot ok={Boolean(health?.[key])} />
              <div>
                <strong>{label}</strong>
                <small>
                  {health?.[key]
                    ? "可用"
                    : key === "ai"
                      ? "未配置或不可用"
                      : "不可用"}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <h2>扩展连接</h2>
        <p>
          在 Edge 扩展的设置页填写以下 API 地址，并填入服务端{" "}
          <code>EXTENSION_TOKEN</code> 的值。
        </p>
        <div className="copy-value">{window.location.origin}</div>
        <p className="muted">
          令牌只保存在扩展的本地存储中，不会写入网页或数据库。
        </p>
      </section>
      <section className="settings-card">
        <h2>标签管理</h2>
        <form className="tag-form" onSubmit={(event) => void createTag(event)}>
          <input
            value={name}
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            placeholder="新标签名称"
          />
          <button type="submit">创建</button>
        </form>
        {error && <p className="error-text">{error}</p>}
        <div className="managed-tags">
          {tags.map((tag) => (
            <span key={tag.id}>
              {tag.name}
              <button
                aria-label={`删除 ${tag.name}`}
                onClick={() => void api.deleteTag(tag.id).then(reloadTags)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

export function App() {
  const [view, setView] = useState<"search" | "settings">("search");
  const [query, setQuery] = useState("");
  const [ai, setAi] = useState(false);
  const [status, setStatus] = useState("");
  const [domain, setDomain] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [health, setHealth] = useState<Health>();
  const [result, setResult] = useState<SearchResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string>();

  const loadTags = useCallback(async () => {
    setTags(await api.tags());
  }, []);
  useEffect(() => {
    void loadTags().catch(() => undefined);
    void api
      .health()
      .then(setHealth)
      .catch(() =>
        setHealth({ database: false, search: false, worker: false, ai: false })
      );
  }, [loadTags]);

  const search = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      q: query,
      ai: String(ai),
      page: "1",
      limit: "20"
    });
    if (status) params.set("captureStatus", status);
    if (domain.trim()) params.set("domain", domain.trim());
    selectedTags.forEach((tagId) => params.append("tagIds", tagId));
    try {
      setResult(await api.search(params));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ai, domain, query, selectedTags, status]);

  const activeFilterCount =
    selectedTags.length + Number(Boolean(status)) + Number(Boolean(domain));
  const resultCountLabel = useMemo(
    () =>
      result ? `${result.items.length} 条结果 · ${result.meta.tookMs} ms` : "",
    [result]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setView("search")}
        >
          <span className="brand-mark">B</span>
          <span>Bookmark Recall</span>
        </button>
        <nav>
          <button
            className={view === "search" ? "active" : ""}
            onClick={() => setView("search")}
          >
            检索
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            设置
          </button>
        </nav>
        <div className="service-state">
          <StatusDot ok={Boolean(health?.database && health.search)} />
          {health?.database && health.search ? "本地服务正常" : "服务异常"}
        </div>
      </header>
      {view === "settings" ? (
        <SettingsPanel health={health} tags={tags} reloadTags={loadTags} />
      ) : (
        <main className="search-page">
          <section className="hero">
            <div className="eyebrow">找回你保存过的知识</div>
            <h1>不必记住标题，记住内容就够了。</h1>
            <form
              className="search-box"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <span className="search-icon">⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、正文、标签或记得的大意…"
              />
              <button className="primary" type="submit" disabled={loading}>
                {loading ? "检索中…" : "搜索"}
              </button>
            </form>
            <label className={`ai-toggle ${ai ? "enabled" : ""}`}>
              <input
                type="checkbox"
                checked={ai}
                onChange={(event) => setAi(event.target.checked)}
              />
              <span className="switch" />
              <span>
                <strong>AI 辅助检索</strong>
                <small>扩展查询并仅在召回结果中重排</small>
              </span>
            </label>
          </section>
          <div className="workspace">
            <aside className="filters">
              <div className="filter-title">
                <h2>筛选</h2>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setSelectedTags([]);
                      setStatus("");
                      setDomain("");
                    }}
                  >
                    清除 {activeFilterCount}
                  </button>
                )}
              </div>
              <label>
                采集状态
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">全部状态</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                域名
                <input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="例如 github.com"
                />
              </label>
              <fieldset>
                <legend>标签</legend>
                <div className="filter-tags">
                  {tags.length === 0 && <span className="muted">暂无标签</span>}
                  {tags.map((tag) => (
                    <label key={tag.id}>
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag.id)}
                        onChange={() =>
                          setSelectedTags((current) =>
                            current.includes(tag.id)
                              ? current.filter((id) => id !== tag.id)
                              : [...current, tag.id]
                          )
                        }
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="filter-apply"
                type="button"
                onClick={() => void search()}
              >
                应用筛选
              </button>
            </aside>
            <section className="results">
              <div className="results-head">
                <div>
                  <h2>
                    {result ? `“${result.meta.query || "全部"}”` : "搜索结果"}
                  </h2>
                  <span>{resultCountLabel}</span>
                </div>
                {result?.meta.aiApplied && (
                  <span className="ai-badge">AI 已重排</span>
                )}
              </div>
              {result?.meta.aiFallbackReason && ai && (
                <div className="notice">
                  AI 未生效，已自动使用普通检索：{result.meta.aiFallbackReason}
                </div>
              )}
              {error && <div className="notice error">{error}</div>}
              {!result || result.items.length === 0 ? (
                <EmptyState searched={Boolean(result)} />
              ) : (
                <div className="result-list">
                  {result.items.map((item) => (
                    <ResultCard
                      key={item.id}
                      item={item}
                      onOpen={() => setDetailId(item.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      )}
      {detailId && (
        <DetailDrawer
          id={detailId}
          allTags={tags}
          onClose={() => setDetailId(undefined)}
          onChanged={search}
        />
      )}
    </div>
  );
}
