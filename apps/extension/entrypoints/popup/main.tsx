import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { apiRequest, getConfig } from "../../lib/client.js";
import "./style.css";

interface Folder { id: string; label: string; }
interface SearchHit { id: string; title: string; url: string; domain: string; snippet: string; }
interface Capture { url: string; title: string; description: string; plainText: string; headings: string[]; language: string; }

function foldersFrom(nodes: Browser.bookmarks.BookmarkTreeNode[], depth = 0): Folder[] {
  return nodes.flatMap((node) => node.url ? [] : [
    ...(node.id !== "0" ? [{ id: node.id, label: `${"　".repeat(Math.max(0, depth - 1))}${node.title || "根目录"}` }] : []),
    ...foldersFrom(node.children ?? [], depth + 1)
  ]);
}

function Popup() {
  const [connected, setConnected] = useState<boolean>();
  const [configured, setConfigured] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([getConfig(), browser.bookmarks.getTree()]).then(([config, tree]) => {
      setConfigured(Boolean(config.token)); setFolderId(config.folderId ?? ""); setFolders(foldersFrom(tree));
      return apiRequest("/health", undefined, false);
    }).then(() => setConnected(true)).catch(() => setConnected(false));
  }, []);

  async function chooseFolder(value: string) { setFolderId(value); await browser.storage.local.set({ folderId: value }); }

  async function saveCurrent() {
    setBusy(true); setMessage("");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error("当前页面不是可收藏的 HTTP(S) 网页");
      const capture = await browser.tabs.sendMessage(tab.id, { type: "bookmark-recall:capture" }) as Capture;
      const created = await browser.bookmarks.create({ ...(folderId ? { parentId: folderId } : {}), title: capture.title || tab.title || tab.url, url: tab.url });
      await apiRequest("/captures", { method: "POST", body: JSON.stringify({ ...capture, sourceBookmarkId: created.id, ...(folderId ? { folderExternalId: folderId } : {}) }) });
      setMessage("已收藏并保存正文");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  async function search() {
    setBusy(true); setMessage("");
    try {
      const payload = await apiRequest<{ items: SearchHit[] }>(`/search?q=${encodeURIComponent(query)}&ai=false&limit=5`, undefined, false);
      setResults(payload.items);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  return <div className="popup">
    <header><div className="logo">B</div><div><strong>Bookmark Recall</strong><small><i className={connected ? "ok" : ""} />{connected === undefined ? "检查服务…" : connected ? "本地服务已连接" : "无法连接服务"}</small></div><button title="设置" onClick={() => void browser.runtime.openOptionsPage()}>⚙</button></header>
    {!configured && <div className="notice">请先在设置页填写扩展令牌。</div>}
    <section><label>保存到 Edge 文件夹<select value={folderId} onChange={(event) => void chooseFolder(event.target.value)}><option value="">默认文件夹</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></label><button className="save" disabled={busy || !configured} onClick={() => void saveCurrent()}>＋ 收藏当前网页并保存正文</button></section>
    <section className="quick"><h2>快速搜索</h2><form onSubmit={(event) => { event.preventDefault(); void search(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入记得的线索…" /><button disabled={busy}>搜索</button></form>
      <div className="results">{results.map((item) => <button key={item.id} onClick={() => void browser.tabs.create({ url: item.url })}><strong>{item.title}</strong><small>{item.domain}</small>{item.snippet && <span>{item.snippet}</span>}</button>)}</div>
    </section>
    {message && <p className="message">{message}</p>}
    <footer><button onClick={() => void browser.tabs.create({ url: "http://127.0.0.1:3210" })}>打开完整管理器 ↗</button></footer>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Popup /></StrictMode>);
