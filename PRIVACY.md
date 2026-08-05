# Recalink 隐私说明

Recalink `0.1.0-alpha` 是单用户、本地部署的软件，默认不提供遥测、广告、账号系统或第三方分析。

## 本地保存的数据

PostgreSQL 保存书签 URL、标题、文件夹来源、用户备注、标签、采集状态和提取后的纯文本正文。Meilisearch 保存用于检索的对应索引。数据位于本机 Docker named volumes 中。

## Edge 扩展

- `bookmarks`：首次导入收藏树，并监听收藏新增、修改、移动和删除；
- `storage`：在浏览器本地保存 API 地址、扩展令牌和默认收藏文件夹；
- `activeTab`：仅在用户操作当前页面时读取页面地址、标题和显式采集所需内容；
- 本地主机访问权限：连接 `http://127.0.0.1` 或 `http://localhost` 上的 Recalink API。

后台同步只上传收藏夹结构、标题和 URL。WXT 内容脚本匹配所有 `http://*/*` 和 `https://*/*` 页面，因此会被浏览器注入这些页面；注入后平时只注册消息监听并保持空闲。只有用户在 popup 中明确点击“收藏当前网页并保存正文”，popup 向当前标签页发送 `bookmark-recall:capture` 消息后，内容脚本才克隆并清理 DOM，再提取可读纯文本、标题层级、描述和语言。表单控件、脚本和完整 DOM 不会作为采集载荷保存。

扩展声明的 `http://127.0.0.1/*` 和 `http://localhost/*` host permissions 仅用于连接本机 Recalink API，与内容脚本匹配全部 HTTP(S) 页面的范围不同。

扩展令牌保存在 `chrome.storage.local`，并通过 Bearer 请求发送到用户配置的 Recalink API。它不会写入数据库。

## 服务端网页采集

Edge 原生新增公开 HTTP(S) 收藏后，worker 可能在不使用浏览器登录状态的情况下请求网页。服务端拒绝回环、私网、链路本地和云元数据地址，并限制超时、重定向、响应体和正文长度。

## 可选 AI

AI 默认关闭。配置 OpenAI 兼容接口后：

- AI 搜索可能发送查询、候选标题、域名和命中片段；
- AI 标签建议可能发送标签档案和有限正文摘录；
- API 密钥只从服务端环境变量读取；
- AI 返回的新标签未经用户确认不会成为正式标签。

数据如何被 AI 服务商处理取决于用户选择的服务商及其政策。处理敏感书签前，应先确认服务商的数据保留和训练设置。

## 删除数据

在 Recalink 中移除书签属于软删除：书签的 `removed_at` 和来源的 `tombstoned_at` 会被设置，使其退出 Recalink 界面和搜索索引，但不会删除 Edge 原收藏；`page_contents` 等已有记录仍可能保留在 PostgreSQL 中。

彻底删除全部本地存储需要删除 Docker named volumes，且操作不可恢复。执行前请先阅读 [README 的安全警告](README.md#安全与限制)，不要在不明确希望清空数据时删除 volumes。
