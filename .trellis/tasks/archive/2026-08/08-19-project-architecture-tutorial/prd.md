# 项目整体架构与实现细节入门教程

## Goal

帮助项目新手在阅读教程后建立可运行的整体心智模型：知道项目由哪些工作区和模块组成，能够从用户发送消息一路追踪到后端运行时、模型/工具、SSE 事件、数据库 checkpoint 和前端时间线，并能按推荐顺序继续阅读源码。

## Background / Confirmed Facts

- 仓库是前后端分离的单仓库：`frontend/` 使用 pnpm，`backend/` 使用 uv workspace。
- 前端入口是 `frontend/apps/web/src/app/main.tsx`，当前 `App` 直接渲染聊天页面。
- 后端入口是 `backend/apps/api-server/app/main.py`，由 `factory.py` 创建 FastAPI 应用并注册 auth、threads、runs、interrupts、checkpoints、mcp 路由。
- 一次聊天运行的主协议是 `POST /api/runs/stream` 返回 SSE；事件包含统一的 `version/event/run_id/thread_id/sequence/data` 字段。
- 后端运行编排位于 `app/modules/runs/`，模型与 LangGraph 运行时位于 `backend/packages/lui-agent-runtime/`；API 层负责依赖装配。
- 时间线是跨层核心数据结构：后端 `TimelineRecorder` 将业务事件投影到 checkpoint，前端 `reduceTimeline` 将同一事件投影到 Zustand 状态。
- 线程、运行、checkpoint、interrupt、MCP server/tool 是主要持久化实体；数据库使用 PostgreSQL，迁移位于 `backend/apps/api-server/migrations/`。
- 前端使用 React + TypeScript + Zustand + Vite；前端 DTO 由后端 OpenAPI 离线生成。
- 项目已有 FakeChatModel、Makefile、后端/前端测试，教程应优先使用这些可验证入口。

## Requirements

1. 用面向新手的语言解释项目目录、技术栈和各层职责。
2. 以“发送一条消息”为主线，分步骤解释前端提交、鉴权、SSE 解析、事件归约、后端路由、运行编排、LangGraph/LLM、持久化和最终刷新。
3. 解释统一事件协议、sequence 去重、timeline projection、checkpoint 分支、流式输出、取消和 interrupt 审核恢复。
4. 解释 MCP 的配置、工具快照、调用审批和恢复边界，但不展开与主聊天链路无关的每个安全实现细节。
5. 给出关键文件的可点击链接和推荐源码阅读顺序；必要时指出容易误解的设计取舍。
6. 给出本地启动、测试和验证命令，并说明 Fake provider 与真实模型配置的区别。
7. 明确当前代码事实与教程中的理解性类比，不能把推测写成已实现功能。

## Out of Scope

- 不修改产品代码，不重构目录，不新增面向用户的项目文档文件。
- 不逐文件解释所有 UI 样式、每个 MCP 沙箱策略和所有测试用例。
- 不把教程写成 LangChain、LangGraph 或 FastAPI 的通用教材；只解释它们在本项目中的落点。

## Acceptance Criteria

- [ ] 新手能用一张简化架构图理解 frontend、API、runtime、database、MCP 的关系。
- [ ] 新手能按教程追踪一次普通消息从发送到完成，并知道每一步应阅读哪些文件。
- [ ] 新手能解释 `AgentEvent` 如何被 SSE 客户端、`useRunStore` 和 `reduceTimeline` 消费。
- [ ] 新手能区分内存中的运行状态、数据库中的 checkpoint/timeline 和前端显示状态。
- [ ] 新手能理解 send/edit/regenerate、取消、工具审批恢复、分支切换的基本流程。
- [ ] 教程中的关键命令和文件路径均与当前仓库代码一致。
