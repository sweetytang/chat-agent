# 双工作区迁移调研

## 官方约束

- pnpm 工作区根必须包含 `pnpm-workspace.yaml`；默认在工作区根维护共享 `pnpm-lock.yaml`，本地包可通过 `workspace:*` 严格解析。来源：https://pnpm.io/workspaces
- uv 工作区的每个 member 都有自己的 `pyproject.toml`，整个工作区共享一个 `uv.lock`；member 之间通过 `{ workspace = true }` 解析。来源：https://docs.astral.sh/uv/concepts/projects/workspaces/
- uv 工作区共享 Python 版本约束和环境，因此本项目所有 Python member 统一使用 `>=3.14`。

## 当前仓库证据

- 有效产品：`apps/lui-agent/frontend` 与 `apps/lui-agent/backend`，共 225 个受版本控制文件。
- 根 `package.json` 脚本指向不存在的 `apps/chat-agent-self`；前端已经出现在根 `pnpm-lock.yaml` importer 中。
- 只有一个 Python 项目：`apps/lui-agent/backend/pyproject.toml`；已有 uv 锁文件和 `.venv`。
- 根 Prisma/SQLite 只被旧 `prisma.config.ts`、`prisma/`、`config/prisma.ts`、根依赖和 `database/index.db` 使用；当前后端使用 PostgreSQL/SQLAlchemy/Alembic。
- VS Code、Makefile、Docker Compose、Alembic、测试和一处迁移测试包含旧路径，需要同步更新。
- 当前没有 `.github/workflows`；远端是 GitHub。

## 包边界结论

- `app/common/events.py`、`app/graph/*`、`app/integrations/tools/*` 不依赖 FastAPI、数据库或认证，已有图、事件和工具测试，适合作为 `lui-agent-runtime`。
- MCP 模块仍与数据库、API 和未完成任务高度耦合，不应在本次进一步拆包。
- 前端已有多组手写 HTTP DTO；FastAPI OpenAPI 可作为生成源。现有鉴权重试与 SSE 状态机属于运行行为，应保留手写实现。

## 风险结论

- 目录物理移动必须与逻辑重构分开，先恢复所有检查，再进入业务优化。
- 4 个主题文件包含用户改动，移动前后必须逐项比对。
- DTO 生成文件需入库；前端编译依赖文件，不依赖运行中的后端服务。
- 后端 CI 每次重新生成 DTO 并检查差异；生成文件变化自然触发前端路径检查。
