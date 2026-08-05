# 贡献指南

感谢你改进 Recalink。当前项目处于本地单用户 Alpha，请优先提交范围清晰、可测试且不扩大数据收集面的改动。

## 开发环境

- Node.js 24
- npm
- Docker Desktop

```powershell
npm ci
Copy-Item .env.example .env
npm run verify
```

涉及数据库、检索或队列时，再启动 Docker 服务并运行合成烟雾测试：

```powershell
docker compose up -d --build
docker compose exec -T api node --import tsx scripts/smoke-test.ts
```

## 提交要求

- 功能和缺陷修复先添加能失败的测试；
- 不提交 `.env`、令牌、AI 密钥、真实收藏、网页正文或数据库导出；
- 不增加扩展权限，除非 PR 明确说明用途、风险和更小权限方案；
- 更新用户可见行为时同步 README、隐私说明或变更记录；
- 提交前运行 `npm run verify`。

提交信息建议使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:` 或 `chore:` 前缀。
