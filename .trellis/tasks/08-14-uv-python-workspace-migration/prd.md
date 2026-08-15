# 迁移为 pnpm/uv 双隔离工作区

## Goal

将有效前端和后端分别迁入顶层 pnpm 与 uv 工作区，由 Git 根统一编排，清理旧工程资产，并在不改变产品行为的前提下建立可验证的跨工作区 DTO 与 CI 合同。

## Background

- 当前前后端分别位于 `apps/lui-agent/frontend` 与 `apps/lui-agent/backend`；后端已有独立 uv 项目，前端已被根 pnpm 锁文件收录。
- 根 Node 入口已失效；用户确认 Prisma/SQLite 实现完全废弃，当前数据库权威实现是 PostgreSQL、SQLAlchemy 与 Alembic。
- 当前 4 个主题文件有未提交改动，必须直接随目录迁移；MCP V1 暂停到父任务完成之后。
- 前端 HTTP DTO 与后端 Pydantic 模型重复，仓库当前没有 CI。

## Requirements

- 创建 `frontend/` pnpm workspace，包含 `apps/web` 与 `packages/api-types`，并维护唯一前端锁文件。
- 创建 `backend/` uv workspace，包含 `apps/api-server` 与 `packages/lui-agent-runtime`，并维护唯一后端锁文件和共享环境。
- `lui-agent-runtime` 使用可安装的 `src` 布局，提取业务事件、LangGraph 运行时和工具抽象及其独立测试；不得反向依赖 API 应用。
- API 应用保持现有 FastAPI、Alembic、测试和 `app.*` 入口，通过 `workspace = true` 依赖运行时包。
- `api-types` 从 `app.openapi()` 离线导出的 Schema 生成 TypeScript DTO；生成文件提交入库，Web 应用通过 `workspace:*` 引用。
- 保留手写 HTTP 请求、Token 刷新、错误处理和 SSE 状态机。
- Git 根 Makefile 统一调用两个工作区；Docker Compose 保留在 Git 根并继续提供 PostgreSQL。
- 使用原生 GitHub Actions 路径触发建立前端和后端 CI；后端 CI 包含 DTO 漂移检查，生成类型变化会触发前端检查。
- 迁移前保存并核对 4 个主题文件差异；迁移后验证内容及主题合同。
- 直接删除 Prisma schema/config、Prisma/Better SQLite 依赖、生成客户端、`database/index.db` 及仅服务于旧实现的配置；其他根遗留项必须先验证无消费者。
- 更新 VS Code、测试、Alembic、Ruff、Mypy、Vite 和现有路径引用；迁移不得改变 API、数据库模型、事件协议或 UI 行为。

## Acceptance Criteria

- [ ] `frontend/pnpm-lock.yaml` 是唯一前端锁文件，冻结安装、按包过滤的测试/lint/build 均通过。
- [ ] `backend/uv.lock` 是唯一后端锁文件，`uv sync --locked` 和两个 member 的独立检查均通过。
- [ ] 根目录不存在 Node/Python 业务依赖清单或失效脚本，Makefile/Compose 可完成全栈开发与验证。
- [ ] 后端无需监听端口即可生成 DTO；生成结果可重复，Web 在后端未启动时可独立检查和构建。
- [ ] 前端 CI、后端 CI、DTO 漂移与数据库迁移检查在 GitHub Actions 中有明确触发路径。
- [ ] Prisma/SQLite 资产与依赖完全消失，PostgreSQL 迁移和查询测试通过。
- [ ] 4 个主题文件的已有差异在新路径中完整保留，主题单元合同、lint、类型检查和构建通过。
- [ ] 后端全量测试、前端全量测试与关键登录、线程、运行、审批、MCP 页面链路无回归。

## Out of Scope

- 业务逻辑优化、UI 重设计、完整 API 客户端生成、SSE 类型生成和自动部署。
- 恢复或继续实现 MCP V1 未完成能力。
