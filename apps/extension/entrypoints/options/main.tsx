import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { apiRequest, defaultConfig, getConfig } from "../../lib/client.js";
import "./style.css";

function Options() {
  const [apiUrl, setApiUrl] = useState(defaultConfig.apiUrl); const [token, setToken] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void getConfig().then((config) => { setApiUrl(config.apiUrl); setToken(config.token); }); }, []);
  async function save() { setBusy(true); try { await browser.storage.local.set({ apiUrl: apiUrl.replace(/\/$/, ""), token }); await apiRequest("/health", undefined, false); setMessage("设置已保存，服务连接正常。") } catch (error) { setMessage(`设置已保存，但连接失败：${(error as Error).message}`); } finally { setBusy(false); } }
  async function sync() { setBusy(true); try { const result = await browser.runtime.sendMessage({ type: "bookmark-recall:full-sync" }) as { bookmarks: number; folders: number }; setMessage(`同步完成：${result.bookmarks} 个书签，${result.folders} 个文件夹。`); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  return <main><div className="brand"><span>B</span><div><strong>Bookmark Recall</strong><small>Edge 扩展设置</small></div></div><section><h1>连接本地服务</h1><p>API 和扩展令牌来自项目根目录的 <code>.env</code>。令牌仅保存在浏览器本地。</p><label>API 地址<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="http://127.0.0.1:3210" /></label><label>扩展令牌<input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="EXTENSION_TOKEN" /></label><div className="actions"><button disabled={busy} onClick={() => void save()}>保存并测试</button><button className="secondary" disabled={busy || !token} onClick={() => void sync()}>立即全量同步 Edge 收藏</button></div>{message && <div className="message">{message}</div>}</section><aside><strong>隐私说明</strong><p>后台同步只上传收藏夹结构与 URL。只有你点击“收藏当前网页并保存正文”时，扩展才读取当前页面的可读文本；表单、脚本和完整 DOM 不会上传。</p></aside></main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Options /></StrictMode>);
