# 新建 lui-agent 全功能 Python/FastAPI 重构

## Goal

新建独立的 `lui-agent` 全栈子项目，完整吸收 `chat-agent`、`chat-agent-self`、`branching-chat` 的已实现能力，避免在旧项目上继续迭代造成方案和范围错位。新项目后端使用 Python + uv + FastAPI，数据库直接使用 PostgreSQL，前端同步使用新的实现。

## Initial Scope

- 只新增 `lui-agent`，不修改或回退其他三个旧项目。
- 必须先读取三套项目的代码、配置、数据模型、文档和现有运行链路，建立功能基线，再实现新项目。
- 新项目不要求兼容旧前端实现，但必须保留旧项目的用户可观察功能。

## Requirements

- 后端：Python、uv、FastAPI。
- 数据库：PostgreSQL，从第一版开始使用，不以 SQLite 作为过渡数据库。
- 前端：新建 React/TypeScript 前端，重新设计 fetch-based SSE、状态管理和页面组件。
- 完整迁移普通聊天、流式输出、工具调用、人工审核、checkpoint 分支、编辑、重新生成、历史回放、线程管理、鉴权、停止/错误处理、reasoning/DeepSeek thinking、structured output、generative UI、模型 provider 配置等能力。
- LangGraph/LangChain 的使用边界、API 事件协议、数据库模型和前端状态模型必须在设计阶段明确，不能直接复制旧项目的 Express 或 LangGraph Server 结构。
- 已确认：Python LangGraph 作为进程内 Agent 编排库；`lui-agent` 使用 FastAPI 自研业务 API、持久化、运行生命周期和事件协议。

## Evidence From Existing Projects

- `chat-agent` 提供 LangGraph graph、provider 配置、weather/search 工具、structured output、generative UI、reasoning metadata 和 LangGraph Server 集成。
- `chat-agent-self` 提供 Express 自研运行时、线程/鉴权/Prisma 持久化、HITL approve/edit/reject/resume、DeepSeek thinking 适配、消息序列化和前端运行状态管理。
- `branching-chat` 提供 checkpoint parent-child 树、编辑旧消息分支、AI 重新生成、历史回放和分支切换的完整实现，以及工具审核与分支状态绑定。
- 现有根 Prisma schema 使用 SQLite；`lui-agent` 明确从第一版直接使用 PostgreSQL，不能依赖 SQLite 过渡。

## Acceptance Criteria

- [ ] `lui-agent` 可使用 uv 安装依赖、启动 FastAPI 后端和 React 前端。
- [ ] PostgreSQL schema、迁移、连接配置和本地启动方式可重复执行。
- [ ] 三个旧项目的能力清单逐项映射到新项目模块和测试场景。
- [ ] 新前端通过 fetch SSE 完成普通聊天、工具审核/恢复、分支切换和完整内容渲染。
- [ ] 后端测试覆盖 checkpoint 分支、HITL、事件协议、鉴权、数据库持久化和核心运行状态。
- [ ] 在不依赖真实模型和外部天气/搜索服务的情况下，核心自动化测试可稳定运行。
- [ ] 真实模型冒烟测试独立于主测试，可选执行。

## Out of Scope

- 不修改三个旧项目的产品代码。
- 第一版不做微服务拆分、云部署、消息队列基础设施和性能压测。

## Open Questions

- 无阻塞性产品决策；剩余技术细节在设计和实现阶段按代码审计结果确定。
