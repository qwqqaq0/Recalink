# 变更记录

本项目采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，并计划在稳定发布后遵循语义化版本。

## [Unreleased]

### Fixed

- 烟雾测试改为独立、随机命名的 Compose 环境，并在运行前检查隔离配置和空数据库，避免合成全量同步影响已有收藏。
- Docker 构建上下文排除本地隔离工作树。
- 更新 Fastify、fast-uri 和 nanoid 的兼容版本锁定，修复依赖审计发现的问题。

### Added

- 收藏当前网页前可修改书签名称。
- Recalink 公开 Alpha 文档、基础仓库治理和持续集成。

### Changed

- 产品展示名和 npm workspace 作用域改为 Recalink。
- 浏览器扩展使用 Recalink 图标并收紧未使用权限。

## [0.1.0-alpha] - 2026-08-05

### Added

- Edge/Chromium 收藏夹首次导入与单向事件同步。
- 显式正文采集、服务端公开网页采集与元数据降级。
- PostgreSQL、pg-boss、Meilisearch 全文检索和命中片段。
- 中文 Web 管理器、扩展快速搜索、标题/备注/标签管理。
- 可选 AI 查询扩展、候选重排和待确认标签建议。
- 合成烟雾测试与 Hit@1、Hit@5、Hit@10 搜索评估脚本。
