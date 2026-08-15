# pnpm/uv 双工作区迁移与业务代码重构

## Goal

在保持现有产品链路和数据合同正确的前提下，将仓库改造成 pnpm 与 uv 顶层物理隔离的跨语言双工作区，再分阶段简化有效业务代码、统一格式并删除死代码。

## Background

- 当前有效产品位于 `apps/lui-agent/frontend` 和 `apps/lui-agent/backend`；前端使用 React/TypeScript/Vite/pnpm，后端使用 FastAPI/SQLAlchemy/PostgreSQL/uv。
- 根 Node 脚本指向已不存在的应用；用户确认旧 Prisma/SQLite 子系统已经废弃，应直接删除。
- 前端手写多组 HTTP DTO，后端已有对应 Pydantic/OpenAPI 定义；SSE 另有独立流式协议。
- 仓库位于 GitHub 且当前没有 CI。
- 4 个主题文件存在未提交改动，必须直接迁移并完整保留；MCP V1 任务暂停到本任务全部完成之后。

## Requirements

- 先完成并验收工作区迁移子任务，再开始业务重构子任务；父任务只负责范围、顺序和最终集成验收。
- Git 根只保留跨语言 Makefile、Docker Compose、CI 和仓库级配置，不承载 Node 或 Python 业务依赖。
- 前端工作区固定在 `frontend/`，应用位于 `frontend/apps/web`，生成类型包位于 `frontend/packages/api-types`；使用独立 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`。
- 后端工作区固定在 `backend/`，应用位于 `backend/apps/api-server`，运行时包位于 `backend/packages/lui-agent-runtime`；使用独立 `pyproject.toml`、`uv.lock` 和共享 `.venv`。
- `lui-agent-runtime` 只承载业务事件、LangGraph 运行时和工具抽象等不依赖 FastAPI、数据库与认证的代码；API 应用通过 uv workspace 依赖它。
- FastAPI/Pydantic 是普通 HTTP DTO 的唯一权威来源；离线生成并提交 TypeScript 类型，前端不得继续手写同一 DTO。
- 保留现有 HTTP 请求层、鉴权刷新、错误处理和 SSE 协议；不生成请求客户端，不用 OpenAPI 替换 SSE 类型。
- 新增最小 GitHub Actions CI：按工作区路径运行冻结锁文件安装、静态检查、测试、构建、迁移测试和 DTO 漂移检查；不做自动部署。
- 迁移前后逐项比对 4 个主题文件，不能通过还原或重建覆盖用户改动。
- 重构仅覆盖迁移后的有效前端/后端业务代码；格式化、机械清理、结构重构和行为修复必须分批。
- 用户确认废弃或审计证明无消费者的代码直接删除，不增加兼容层或归档副本。
- 阻断核心链路、数据正确性或安全的缺陷先补回归测试再修复；直接相关的小缺陷仅在有明确测试保护时修复；无关非阻断缺陷只记录，不扩展范围。
- MCP V1 不在本任务中继续开发，只允许为保持现有行为进行必要的路径和结构适配。

## Acceptance Criteria

- [ ] pnpm 与 uv 能从各自工作区根独立锁定、安装和运行命令，互不发现或修改对方环境。
- [ ] 根 Makefile 能统一执行安装、开发、测试、检查、构建、数据库迁移和 DTO 生成。
- [ ] 后端应用与 `lui-agent-runtime` 均为可独立验证的 uv workspace member；前端应用与 `api-types` 均为 pnpm workspace member。
- [ ] HTTP DTO 可从后端源码离线稳定生成并入库；重复生成无差异，后端未启动时前端仍可检查和构建。
- [ ] GitHub Actions 对前端、后端、契约和根编排变更执行正确门禁，不包含部署。
- [ ] Prisma、Better SQLite、旧 schema/config/client、SQLite 数据文件和专用辅助代码完全移除，PostgreSQL/SQLAlchemy/Alembic 链路正常。
- [ ] 4 个主题文件迁移后内容与行为完整保留，前端相关检查通过。
- [ ] 超过 500 行的有效业务文件按职责拆分，目标范围内的死代码和缓存产物清理完成。
- [ ] 前后端 lint、格式、类型、测试、构建、迁移与关键浏览器链路全部通过。
- [ ] 公共 API、SSE 事件、数据库模型和用户可观察行为与基线一致，明确批准并有测试的缺陷修复除外。

## Out of Scope

- 替换 React/Vite、移除 pnpm或重写现有 HTTP/SSE 客户端。
- 自动部署、部署环境和密钥管理。
- 新增 MCP V1 功能、重做 UI 或增加其他业务能力。
- 重构 `.trellis`、开发工具或历史教程。
- 为追求包数量而创建没有独立职责和验证价值的包。
