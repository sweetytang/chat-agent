# 业务代码简化与死代码清理

## Goal

在双工作区迁移验收通过后，按模块简化有效前后端业务代码、统一格式、拆分过大职责并删除死代码，同时维持公共合同和关键链路正确。

## Background

- 后端约 5109 行，`api/runs.py` 约 900 行；前端约 4248 行，`McpSettings/index.tsx` 约 631 行、`useMcpSettings.ts` 约 541 行。
- 前端已有 ESLint、Stylelint、Prettier、TypeScript 和 Node 测试；后端已有 Ruff、Mypy、Pytest 和迁移测试。
- 主题改动随迁移成为重构基线；MCP V1 功能开发保持暂停。
- Prisma/SQLite 由前置迁移任务删除，本任务只处理迁移后有效产品中的业务死代码。

## Requirements

- 本任务必须等待工作区迁移子任务完成全部验收。
- 范围只包括 `frontend/apps/web`、`frontend/packages/api-types`、`backend/apps/api-server` 和 `backend/packages/lui-agent-runtime`。
- 优先使用现有语言工具完成格式化、导入排序、未使用符号清理和类型检查，不为清理目的引入复杂框架。
- 超过 500 行的有效业务文件按真实职责拆分；组件与对应 CSS Module 保持同目录，跨层合同由单一边界拥有。
- 格式化、机械清理、结构重构和行为修复分批执行，每批完成对应检查后再继续。
- 删除代码前检查静态引用、动态注册、配置、脚本、测试、生成流程和运行入口；用户确认废弃或审计证明无消费者的代码直接删除。
- 缺少测试保护的高风险逻辑先补行为锁定测试，再重构。
- 阻断核心链路、数据正确性或安全的缺陷先补回归测试再修复；直接相关小缺陷仅在有测试时修复；无关非阻断缺陷只记录为后续工作。
- 行为修复不得混入纯格式化或目录移动批次，必须显式说明行为差异和测试证据。
- 主题基线、公共 HTTP/SSE 合同、数据库行为、鉴权刷新、事件顺序和 MCP 现有行为必须保持不变。

## Acceptance Criteria

- [ ] Ruff format/check、Mypy、Pytest、Alembic 迁移测试全部通过。
- [ ] Prettier、ESLint、Stylelint、TypeScript、Node 测试和 Vite 生产构建全部通过。
- [ ] 所有超过 500 行的目标业务文件已拆分或有可验证的单一职责理由；本任务已确认的三个超限文件完成拆分。
- [ ] 删除项具有用户决定或无消费者审计证据，删除后不存在失效导入、配置、脚本或生成引用。
- [ ] 公共 API、HTTP DTO、SSE 事件、数据库模型、主题行为和关键用户链路无回归。
- [ ] 所有行为修复都有先失败后通过的回归测试，并与机械重构清晰分离。
- [ ] 最终 GitHub Actions 前端与后端门禁通过。

## Out of Scope

- 新增业务能力、重做 UI、全仓改名或无收益抽象。
- 重构 `.trellis`、开发工具、历史教程或继续开发 MCP V1。
