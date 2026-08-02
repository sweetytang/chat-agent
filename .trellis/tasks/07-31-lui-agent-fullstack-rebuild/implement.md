# lui-agent 实施计划

## 阶段一：基线和骨架

1. 完成三个旧项目的能力迁移矩阵。
2. 创建 `apps/lui-agent/backend` 的 uv/FastAPI 项目和 `apps/lui-agent/frontend` 的 React/Vite 项目。
3. 创建 PostgreSQL Docker Compose、Alembic 配置、settings 和健康检查。
4. 定义公共消息、run、checkpoint、interrupt、业务事件和展示 payload schema。

## 阶段二：后端领域与持久化

1. 实现 users、refresh tokens、threads、runs、messages、checkpoints、interrupts 数据模型。
2. 实现 repository、事务和 migration，先完成 thread/checkpoint 树回放测试。
3. 实现 OAuth2/JWT、用户依赖和资源归属校验。
4. 实现 run 状态机、FIFO 队列、取消、失败恢复和幂等操作。

## 阶段三：LangGraph 与完整 Agent 能力

1. 移植 Python LangGraph graph、model/provider adapter 和 fake model。
2. 接入普通 Markdown 流、reasoning/DeepSeek thinking、usage metadata。
3. 接入 weather、calculator、web search 和工具审核 approve/edit/reject/resume。
4. 接入 structured output 与 generative UI 展示型 tools。
5. 接入 checkpoint 分支、编辑、重新生成、历史回放和事件适配器。
6. 用 PostgreSQL 集成测试覆盖运行状态和事务边界。

## 阶段四：前端重构

1. 创建 React/TypeScript/Vite 基础布局、认证和线程侧栏。
2. 实现 fetch SSE client、事件解码、sequence 去重、AbortController 和错误处理。
3. 实现 thread/run store、FIFO QueuePanel 和完整消息 reducer。
4. 实现 Markdown、reasoning、工具卡片、ApprovalCard、BranchSwitcher。
5. 实现 structured output、Generative UI 白名单 renderer 和流式渐进更新。
6. 完成分支编辑、重新生成、审核恢复和刷新回放。

## 验证与切换

- 后端：`uv run pytest`，必要时使用 PostgreSQL 测试服务。
- 前端：`pnpm build`、类型检查和事件 reducer 测试。
- 端到端：fake model + PostgreSQL 验证普通聊天、工具审核、队列、分支和两种展示模式。
- 真实模型和外部服务只做独立冒烟测试。
- 新项目独立启动通过后，再考虑是否将旧项目标记为归档；本任务不修改旧项目。
