# 当前事件流与持久化边界

## 已确认实现

- `Chat` 先渲染完整 `history`，再渲染等待态、单一 reasoning 和 presentation cards，跨类型顺序在组件结构中已经丢失：`frontend/apps/web/src/modules/chat/components/Chat/index.tsx:203-311`。
- `ThreadRunState` 分别保存 `history`、`reasoning`、覆盖型 structured/generative 字段和 `presentationItems`；`reduceRunEvent` 只有消息依赖最后一条 history，不能表达“文本 → 工具 → 文本”的分段：`frontend/apps/web/src/modules/runs/store/run.ts:21-35,113-191`。
- `appendPresentationItem` 已按 `runId + sequence` 去重并排序，所以工具结果等并非统一只有一张；真正的单例是 reasoning 和覆盖型字段，`tool.call` 当前不进入展示：`frontend/apps/web/src/modules/presentation/domain/items.ts:3-14`。
- SSE 外层事件包含 `run_id`、`thread_id`、`sequence`，但 data 仍是无类型对象，消息/推理/部分工具路径缺少跨 delta 稳定 item ID：`frontend/apps/web/src/modules/runs/types/events.ts:9-41`。
- rAF dispatcher 只合并 `message.delta`，并在非 delta 前 flush；统一时间线后需把相同顺序约束扩展到其他高频 delta：`frontend/apps/web/src/modules/runs/domain/frameEventDispatcher.ts:12-61`。

## 后端事实

- Runtime 和 API 会产生 reasoning、message、tool call/result/approval、structured output、generative UI、error 和生命周期事件，sequence 在单次运行内递增：`backend/packages/lui-agent-runtime/src/lui_agent_runtime/graph/runtime.py:64-194`、`backend/apps/api-server/app/modules/runs/streaming.py:32-424`。
- calculator、MCP、审核恢复和 LangGraph 工具路径对 call ID 的携带不一致，工具生命周期合并前必须统一：`backend/apps/api-server/app/modules/runs/streaming.py`、`backend/apps/api-server/app/modules/runs/resume.py`。
- `Checkpoint.state` 已保存完整 `messages` 快照；编辑、重新生成和分支切换都以 checkpoint parent/state 为事实来源：`backend/apps/api-server/app/modules/checkpoints/service.py:20-163`。
- history API 只返回 messages；刷新不会恢复 reasoning、tool 或 presentation：`backend/apps/api-server/app/api/threads.py:105-126`、`backend/apps/api-server/app/modules/threads/schemas.py:42-61`。
- 页面生命周期内 SSE 由前端持有，后端没有事件重放或重新订阅接口；多线程任务也明确把刷新后活动运行恢复排除在外：`.trellis/tasks/08-17-frontend-multithread-branch-switching/design.md:78-84`。

## 设计结论

- 用户已明确接受破坏性改造：删除 Message ORM/表、messages/history API、旧 checkpoint state 和已有消息数据，不做兼容迁移。
- `TimelineSnapshot` 是前后端唯一内容事实来源；模型上下文、标题、编辑和重新生成均从 message timeline items 派生。
- checkpoint state 只保存 timeline 快照，避免 messages/timeline 双事实来源和另一套分支体系。
- 每次 agent run 提前拥有独立 checkpoint，防止失败、审批或重新生成轨迹写入共同祖先。
- BusinessEvent 在 SSE 编码前由单一后端 projector 记录；前端由单一 reducer 重放，组件只消费类型化条目。
- 本期保存断开前内容并结束运行，但不实现事件日志重放或自动续流。
