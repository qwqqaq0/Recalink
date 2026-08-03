# Bookmark Recall

Bookmark Recall 是一个单用户、本地部署的 Edge/Chromium 书签管理器。它会保留浏览器原收藏，在本地保存可检索的网页正文，让你用“还记得的内容”找回忘记标题和文件夹的网页。

第一版已经包含：

- 中文 Web 搜索与管理界面；
- Edge Manifest V3 扩展、首次全量导入和收藏事件持续同步；
- 显式收藏当前网页，并从已渲染页面提取 Readability/可见正文；
- PostgreSQL、pg-boss 和 Meilisearch；
- 标题、备注、标签、标题层级、正文、URL 等多字段全文检索与命中片段；
- 可选的 OpenAI 兼容查询扩展、候选重排和待确认标签建议；
- Docker Compose 本地部署、合成烟雾测试和 Hit@1/5/10 搜索评估脚本。

## 快速启动

要求：Docker Desktop，以及构建扩展时使用的 Node.js 24/npm。

```powershell
cd C:\qwqqaq\code\Project\bookmark-recall
Copy-Item .env.example .env
```

至少修改 `.env` 中的两个值：

```dotenv
EXTENSION_API_TOKEN=一个足够长的随机字符串
MEILI_MASTER_KEY=另一个足够长的随机字符串
```

启动服务：

```powershell
docker compose up -d --build
```

等待 `docker compose ps` 中四个服务健康后，打开 <http://127.0.0.1:3210>。

PostgreSQL 和 Meilisearch 只在 Compose 内部网络开放；宿主机只绑定 `127.0.0.1:3210`。

## 安装 Edge 扩展

```powershell
npm install
npm run build:extension
```

然后：

1. 在 Edge 打开 `edge://extensions`；
2. 开启“开发人员模式”；
3. 选择“加载解压缩的扩展”；
4. 选择 `apps\extension\.output\edge-mv3`；
5. 打开扩展设置，API 地址填写 `http://127.0.0.1:3210`；
6. 令牌填写 `.env` 中的 `EXTENSION_API_TOKEN`；
7. 点击“保存并测试”，再点击“立即全量同步 Edge 收藏”。

后台同步只提交收藏夹结构、标题和 URL。只有明确点击“收藏当前网页并保存正文”时，扩展才读取当前页面文本；表单、脚本和完整 DOM 不会上传。

## 日常使用

- Edge 中原生新增、修改、移动和删除收藏，会单向同步到 Bookmark Recall；
- popup 可选择 Edge 文件夹，显式收藏当前页并上传正文；
- Web 管理器可搜索正文、筛选标签/域名/采集状态、编辑本地标题和备注；
- 从项目移除只写入本地墓碑，不删除 Edge 收藏；
- 本地标题、备注和标签不会反写 Edge；
- AI 搜索默认关闭，未配置或调用失败时自动退化为普通全文搜索。

## 可选 AI 配置

支持 OpenAI 兼容的 `/chat/completions` 接口：

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=your-key
AI_MODEL=your-model
AI_TIMEOUT_MS=15000
```

三项齐全后重启 API 和 worker：

```powershell
docker compose up -d --build api worker
```

模型只会接收查询、候选书签的标题/域名/命中片段，或用于标签建议的有限正文摘录。AI 重排只能返回 Meilisearch 已召回的候选 ID；非法输出、超时或未配置均会降级。

## 项目结构

```text
apps/
  api/          Fastify API，并托管构建后的 Web
  worker/       pg-boss 正文采集、索引和标签建议任务
  web/          React/Vite 中文管理界面
  extension/    WXT Edge MV3 扩展
packages/
  contracts/    Zod API/AI 数据契约
  core/         URL 规范化、Readability、SSRF 防护、RRF 等纯逻辑
  db/           Drizzle schema、PostgreSQL 连接和迁移
  server/       仓储、Meilisearch、队列和 AI 服务
scripts/
  smoke-test.ts       Docker 合成闭环测试
  evaluate-search.ts  Hit@1/5/10 评估工具
```

## 验证

完整静态与自动测试：

```powershell
npm run verify
npm audit --audit-level=low
```

Docker 合成烟雾测试不会读取真实 Edge 数据：

```powershell
docker compose exec -T api node --import tsx scripts/smoke-test.ts
```

它验证依赖健康、合成 Edge 树导入、显式正文、正文唯一词首位召回和片段、AI 降级、Edge 改/移/删，以及 AI 新标签确认门槛。

用自己的查询集评估搜索效果：

```powershell
npm run eval:search -- .\my-queries.json
npm run eval:search -- .\my-queries.json --ai
```

数据格式：

```json
[
  {
    "query": "数据库明明有索引却没使用",
    "expectedUrl": "https://example.com/article"
  }
]
```

脚本输出 Hit@1、Hit@5 和 Hit@10。示例格式见 `fixtures/evaluation.sample.json`。

## 安全边界

- 服务端抓取只允许 HTTP(S)，默认 10 秒、5 次重定向、5 MB 响应；
- 每次 DNS 解析和重定向都会拒绝回环、私网、链路本地和云元数据地址；
- 正文最多保存 500,000 字符；
- 扩展令牌只存在于环境变量和 `chrome.storage.local`，不会写入数据库；
- AI 密钥只读取服务端环境变量；
- 第一版是单用户本地工具，不提供账号登录或公网部署防护。

## 停止与数据

```powershell
docker compose down
```

数据库和搜索数据保存在 Docker named volumes 中。`docker compose down` 不删除数据；只有显式添加 `-v` 才会删除这些卷。

## 第一版明确不包含

多用户、双向修改 Edge、移动端、截图/PDF/完整网页归档、向量检索、网页问答、自动应用 AI 标签，以及对所有动态或登录网站的采集成功保证。
