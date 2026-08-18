# 前端多线程与运行中分支切换

## Goal

解决前端把所有会话运行视为单一全局运行的问题，使用户在一个会话仍在生成时可以离开该会话，并继续查看或使用其他会话，而原运行不被误取消、事件不串线。

## Background

- 当前运行态由单一 `useRunStore` 保存，消息历史、运行状态、事件序号和待审核项都没有按 `thread_id` 隔离：[run.ts](/Users/sweetang/code/AI/chat-agent/frontend/apps/web/src/modules/runs/store/run.ts:13)。
- 当前 SSE 控制器是全局单例；启动新流会中止旧流：[activeStream.ts](/Users/sweetang/code/AI/chat-agent/frontend/apps/web/src/modules/runs/domain/activeStream.ts:1)。
- 只要当前会话处于运行态，`controlsDisabled` 就会禁用整个侧边栏及消息分支操作：[Chat/index.tsx](/Users/sweetang/code/AI/chat-agent/frontend/apps/web/src/modules/chat/components/Chat/index.tsx:60)、[AppShell/index.tsx](/Users/sweetang/code/AI/chat-agent/frontend/apps/web/src/app/components/AppShell/index.tsx:26)。
- 会话切换 effect 的清理逻辑会中止全局活动流：[Chat/index.tsx](/Users/sweetang/code/AI/chat-agent/frontend/apps/web/src/modules/chat/components/Chat/index.tsx:63)。
- 后端锁按 `thread_id` 隔离，因此不同会话可并行运行、同一会话内的运行会串行化：[runs.py](/Users/sweetang/code/AI/chat-agent/backend/apps/api-server/app/api/runs.py:45)、[streaming.py](/Users/sweetang/code/AI/chat-agent/backend/apps/api-server/app/modules/runs/streaming.py:47)。
- 既有全栈设计已经约定“一个 thread 同时只有一个 RUNNING run”，同时要求前端不同 thread 的流互不覆盖；本任务需要与该约定保持一致。

## Requirements

- 运行状态、消息投影、错误、事件序号、待审核项和流控制必须按 `thread_id` 隔离。
- 从运行中的会话切换到其他会话时，原会话的运行继续，且完成后可看到正确结果。
- 不同会话的事件不得写入当前会话或覆盖彼此状态。
- 停止操作只能停止当前查看会话的运行。
- 同一会话仍遵守后端单运行串行约束。
- 运行中的会话仍禁止切换其内部历史 checkpoint 分支；本任务只开放侧边栏中的跨会话切换与并行使用。
- 侧边栏为非当前会话显示最小后台状态：运行中、等待审核、失败；运行完成后清除状态，不引入完成未读标记。
- 多会话并行仅保证当前页面生命周期内有效；页面刷新、关闭或重开后的活动运行恢复不在本期范围内。
- 输入草稿由所有会话共享；切换会话不清空草稿，发送时消息归属发送瞬间的当前会话。
- 后台活动会话允许重命名和置顶；运行中、排队中、恢复中或等待审核时禁止删除，进入完成、失败或取消终态后恢复删除。
- 本期不设置前端跨会话并发数量上限，也不新增后端用户级运行配额。

## Acceptance Criteria

- [ ] 会话 A 生成中可切换到会话 B，A 的运行不会因切换被中止。
- [ ] 在 B 中发起运行时，A、B 的流式内容和状态互不串线。
- [ ] 切回 A 可看到持续生成的内容或已完成结果。
- [ ] 在 A 点击停止不会中止 B，反之亦然。
- [ ] 当前查看会话的输入框、停止按钮、错误和审核状态只反映该会话。
- [ ] 后台会话处于运行中、等待审核或失败时，侧边栏显示对应状态；完成后不保留未读标记。
- [ ] 页面内切换不会断开其他会话的活动 SSE；本期不要求刷新页面后恢复或重新订阅活动流。
- [ ] 在会话间切换后输入框草稿保持不变，并发送到点击发送时正在查看的会话。
- [ ] 活动会话可以重命名和置顶，但删除入口不可用；终态会话可以正常删除。
- [ ] 前端不因其他会话正在运行而阻止用户继续创建或运行新的会话。

## Out of Scope

- 暂不改变后端“同一 thread 同时只有一个 RUNNING run”的约束。
- 不支持在同一会话运行中切换历史 checkpoint 分支。
- 暂不引入消息队列基础设施。
- 不新增运行事件持久化、事件重放、断线续传或刷新后重新订阅能力。
- 不实现用户级模型成本配额或并发限流；如后续需要，应由后端提供权威规则。
