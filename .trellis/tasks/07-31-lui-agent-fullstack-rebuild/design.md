# lui-agent 技术设计

## 1. 总体边界

```text
React + TypeScript 前端
  ├─ fetch SSE client
  ├─ 事件 reducer / Zustand store
  ├─ checkpoint 分支视图
  ├─ Markdown / reasoning / structured output / Generative UI renderer
  └─ 工具审核、队列和运行控制
          │ versioned business events
          ▼
FastAPI 应用
  ├─ auth / user / thread / run / branch API
  ├─ PostgreSQL repository + transaction
  ├─ run lifecycle / queue / cancellation
  ├─ SSE event adapter and error boundary
  └─ Python LangGraph runtime
       ├─ graph state and nodes
       ├─ model/provider adapter
       ├─ executable tools
       └─ interrupt/resume
```

FastAPI 是唯一服务入口。LangGraph 不直接暴露 Server API、不决定数据库 schema、不决定前端 DTO，也不直接把内部事件发给浏览器。

## 2. 后端目录

```text
apps/lui-agent/backend/
├── app/
│   ├── main.py
│   ├── api/                 # FastAPI routers and dependencies
│   ├── core/                # settings, security, errors, logging
│   ├── db/                  # SQLAlchemy engine, models, migrations boundary
│   ├── modules/
│   │   ├── auth/
│   │   ├── threads/
│   │   ├── runs/
│   │   ├── checkpoints/
│   │   └── interrupts/
│   ├── integrations/
│   │   ├── llm/             # LangChain model/provider adapter
│   │   └── tools/
│   ├── graph/               # LangGraph state, nodes and graph factory
│   └── common/              # event contracts, message types, IDs
├── tests/
├── alembic/
├── pyproject.toml
└── uv.lock
```

## 3. PostgreSQL 数据模型

首版直接使用 PostgreSQL，核心表：

- `users`、`refresh_tokens`：用户、密码哈希、token 轮换/撤销。
- `threads`：用户拥有的会话和当前 head。
- `runs`：运行状态、队列顺序、取消时间、错误信息和终态。
- `messages`：规范化消息内容、content blocks、tool calls、reasoning/usage metadata。
- `checkpoints`：业务 checkpoint、parent-child 关系、状态快照和 branch 信息。
- `interrupts`：待审核工具调用、request id、所属 checkpoint 和恢复上下文。

写入规则：用户消息 checkpoint、tool result checkpoint、最终 AI checkpoint 分开落库；创建 checkpoint 和更新 thread head 必须在同一事务内完成。

## 4. 运行生命周期

```text
QUEUED → RUNNING → INTERRUPTED → RESUMING → COMPLETED
                    │                       └→ FAILED
                    └→ CANCELLED
```

- 一个 thread 同时只有一个 RUNNING run；后续输入进入 QUEUED。
- cancel 只取消当前 run 或指定 queued run，不清空其他队列项。
- interrupt 会持久化完整恢复上下文，前端刷新后仍能看到审核卡片。
- run 的终态由 FastAPI 控制，不能根据 SSE 客户端是否断开推断成功。

## 5. 事件协议

每条事件包含 `version`、`event`、`run_id`、`thread_id`、`sequence`、`data`。

首版事件：

- `run.queued`、`run.started`、`run.cancelled`、`run.completed`、`run.failed`
- `message.started`、`message.delta`、`message.completed`
- `reasoning.delta`、`reasoning.completed`
- `tool.call`、`tool.approval_required`、`tool.result`
- `checkpoint.created`、`thread.updated`
- `structured_output.delta`、`generative_ui.delta`

事件 reducer 是前端唯一状态入口；组件不能直接解析原始 SSE payload。

## 6. Agent 与工具边界

- LangGraph graph 负责模型节点、工具决策、interrupt/resume 和状态传递。
- FastAPI application service 负责 run、checkpoint、事务、队列和业务事件。
- 工具分为两类：
  - 副作用工具：weather、calculator、web search，可触发 HITL。
  - 展示工具：structured answer、generative UI，只承载结果，不执行副作用、不触发 HITL。
- provider adapter 统一 OpenAI-compatible、OpenAI Responses/reasoning 和 DeepSeek thinking 配置。

## 7. 前端设计

- `services/sse`: 用 `fetch` + `ReadableStream`（可选成熟 SSE parser）支持 POST、Authorization、AbortController 和重连。
- `store/run`: run 状态、队列、事件序号和错误。
- `store/thread`: thread、history、active checkpoint 和 branch。
- `store/message`: message blocks、tool calls、reasoning、structured output、UI spec。
- `domain/branching`: 纯函数还原 checkpoint 树，不让组件自行计算分支。
- `components`: Chat、Sidebar、QueuePanel、ApprovalCard、BranchSwitcher、ReasoningBlock、StructuredOutputCard、GenerativeUICard、ToolCards。

## 8. 风险与回滚

- 先用 fake model、fake tools 和 PostgreSQL 测试容器验证状态机，再接真实 provider。
- 新项目完全独立，任何阶段失败都不会影响三个旧项目。
- 先完成后端事件合同，再实现前端 reducer；前端替换不会反向污染 graph 内部状态。
