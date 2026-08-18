# 统一流式时间线技术设计

## 1. 设计原则

本次采用破坏性重构：删除旧 Message/history 双轨，`TimelineSnapshot` 成为会话内容、模型上下文、分支与 UI 的唯一事实来源。

```text
Agent Runtime
    ↓ RuntimeEvent
事件规范化层（稳定 ID、类型化 data）
    ↓ BusinessEvent v1
时间线纯投影器
    ├──→ checkpoint 持久化服务
    └──→ SSE → 前端纯 reducer
                    ↓
              Timeline Store
                    ↓
              展示组件树
```

边界约束：

- Runtime 不依赖数据库、FastAPI 或 React 展示模型。
- 投影器是纯函数，只负责 `snapshot + event -> snapshot`。
- 持久化服务负责 checkpoint、事务和批量 flush。
- API 只返回类型化 DTO，不暴露 ORM 或原始 SSE data。
- Store 不包含 JSX，组件不解析 payload、不决定事件生命周期。
- `Chat` 只协调运行命令、当前线程和布局，不再拼接多套展示数组。

## 2. 唯一领域模型

### 2.1 TimelineSnapshot

```ts
interface TimelineSnapshot {
  version: 1;
  items: TimelineItem[];
}

type TimelineItem =
  | MessageItem
  | ReasoningItem
  | ToolItem
  | StructuredOutputItem
  | GenerativeUiItem
  | ErrorItem;
```

每个条目包含：

- `id`：语义条目的稳定 ID；
- `runId`：所属运行；用户历史条目允许为空；
- `sequence`：条目首次出现时的运行内 sequence；
- `kind`：可穷举的展示类型；
- `status`：该类型允许的生命周期状态；
- 类型化业务字段；
- 可选的 checkpoint/branch/action 元数据，由历史 API 投影补齐。

数组顺序是跨运行、跨轮次的权威顺序。delta 只更新指定 ID 的条目，不移动位置。

### 2.2 消息与文本段

消息不再单独存储。时间线中的消息条目同时承担对话上下文和展示职责：

```ts
interface MessageItem {
  id: string;                 // 文本段 ID
  kind: 'message';
  logicalMessageId: string;   // 同一助手回复的多个文本段共享
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'completed' | 'cancelled';
  terminalSegment: boolean;
}
```

- 用户消息通常只有一个文本段。
- 连续 assistant delta 更新当前文本段。
- 文本被推理、工具或其他语义条目打断后，后续文本使用新 `id`，但沿用 `logicalMessageId`。
- 模型上下文投影按 `logicalMessageId` 合并 assistant 文本段，并忽略非消息展示字段。
- 编辑和重新生成以 `logicalMessageId + checkpoint` 定位整条逻辑回复；只有终结文本段展示操作入口。

### 2.3 事件映射

| 事件 | 投影动作 |
| --- | --- |
| `message.started` | 以 `item_id` 创建文本段，携带 `message_id` |
| `message.delta` | 按 `item_id` 追加文本 |
| `message.completed` | 完成逻辑消息的最后文本段 |
| `reasoning.delta` | 创建或追加独立推理块 |
| `reasoning.completed` | 完成推理块 |
| `tool.call` | 以 `tool_call_id` 创建执行中工具条目 |
| `tool.approval_required` | 原地进入等待审批 |
| `tool.result` | 原地写入结果并成功/失败结束 |
| `structured_output.delta` | 按 `item_id` 创建或更新结构化输出 |
| `generative_ui.delta` | 按 `item_id` 创建或更新 UI 条目 |
| `run.failed` / `mcp.error` | 结束未完成条目并在当前位置创建错误条目 |
| 生命周期事件 | 只更新运行控制状态，不创建可见条目 |

所有运行路径必须提供稳定 ID。相同类型、不同 ID 表示不同条目；相同 ID 表示增量更新。缺失或找不到目标 ID 属于协议错误，禁止退化为“更新最后一条同类型内容”。

## 3. 后端模块划分

```text
app/modules/timeline/
├── types.py          # TimelineSnapshot / item 类型、序列化合同
├── projector.py      # 纯事件 reducer 与上下文派生
├── service.py        # checkpoint 快照装载、分支元数据投影
└── schemas.py        # API DTO

app/modules/runs/
├── recorder.py       # event → projector → 批量持久化
├── streaming.py
└── resume.py
```

具体命名可按现有模块边界微调，但职责不能重新合并进路由或单个超大 service。

### 3.1 破坏性数据模型

- 删除 `Message` ORM、`MessageRole`、`messages` 表和相关 Repository 方法。
- 删除 `/threads/{thread_id}/messages` 与旧 `/history` DTO/端点。
- Alembic 新迁移直接删除 `messages` 表，不搬运旧数据。
- `Checkpoint.state` 唯一合法内容改为：

```json
{
  "timeline": {
    "version": 1,
    "items": []
  }
}
```

- 旧 checkpoint state 不解析、不兼容；升级后的旧会话不可读取。
- 线程标题在首次 assistant 逻辑消息完成时直接写入，删除从旧 messages 表回填标题的逻辑。

### 3.2 checkpoint 分支

1. `send` / `edit` 创建用户消息 checkpoint：复制父 timeline，追加用户 MessageItem。
2. 每次 agent run 在输出前创建唯一 agent checkpoint，复制用户 checkpoint timeline。
3. `regenerate` 从目标用户 checkpoint 新建同级 agent checkpoint。
4. 本次运行的所有条目只更新 agent checkpoint，禁止修改祖先。
5. 完成、审批、失败或取消都保留 agent checkpoint；因此每次尝试拥有独立轨迹。
6. 下一轮发送从当前 agent checkpoint 创建新的用户 checkpoint。

分支选项属于 API 投影元数据，不写入 timeline 快照。当前分支的最后一个可交互条目承载 BranchSwitcher，因此没有 assistant 文本的错误/审批分支也可切换。

### 3.3 Recorder 与持久化

`TimelineRecorder` 是运行事件进入持久化的唯一入口：

- 使用纯 projector 更新内存 snapshot；
- 条目创建、完成、审批、失败等边界立即 flush；
- 高频 delta 按短周期批量写 checkpoint，避免逐 token 提交；
- 完成、审批中断、失败、取消和生成器关闭时强制 flush；
- 客户端断开时保存当前部分快照，将 run 结束为取消/中断，并追加可重试错误；
- recorder 输出同一 BusinessEvent 给 SSE，禁止持久化与客户端各自改写事件。

本期不增加可重放事件表，不实现断线续流。

## 4. API 合同

删除旧 history/messages 接口，新增：

```http
GET /api/threads/{thread_id}/timeline
```

```ts
interface ThreadTimelineResponse {
  thread_id: string;
  current_checkpoint_id: string | null;
  timeline: TimelineSnapshot;
}
```

发送、编辑和重新生成仍只提交目标 checkpoint 与用户输入；后端从 checkpoint timeline 派生模型上下文，不接收前端回传的完整历史。

API 层负责：

- 所有权校验；
- checkpoint state 的版本校验；
- 为当前分支条目投影 checkpoint、parent、branch options；
- 返回严格 DTO。

## 5. 前端模块划分

```text
modules/timeline/
├── types/
│   └── index.ts
├── domain/
│   ├── normalizeEvent.ts
│   ├── reduceTimeline.ts
│   ├── conversationContext.ts
│   └── smartScroll.ts
└── components/
    ├── ChatTimeline/
    ├── ReasoningBlock/
    └── ToolCallCard/
```

### 5.1 Store

`ThreadRunState` 只保存：

- `timeline`；
- run ID/status/last sequence；
- pending approval 与 retry context 等控制状态。

删除 `history`、`reasoning`、`structuredOutput`、`generativeUi`、`toolResults` 和 `presentationItems`。编辑、重新生成、前序用户内容和局部 optimistic rollback 都使用 timeline 领域函数。

事件处理分两步：

1. `normalizeAgentEvent` 在边界把 raw data 校验为类型化事件；
2. `reduceTimeline` 纯函数按 ID/sequence 更新 snapshot。

### 5.2 组件

```text
Chat
├── ChatTimeline
│   ├── MessageBubble
│   ├── ReasoningBlock
│   ├── ToolCallCard（内部承载审批动作）
│   ├── StructuredOutputCard
│   ├── GenerativeUICard
│   └── InlineErrorCard
└── ChatComposer
```

- `ChatTimeline` 只做 exhaustively typed render switch、空态和等待态。
- 条目 `id` 是唯一 React key，delta 不替换身份。
- 推理运行中展开，完成/历史加载后默认折叠，展开状态只属于组件。
- ToolCallCard 原地表达调用、审批、执行、成功或失败，不渲染第二张 ApprovalCard/ResultCard。
- 卡片只接收类型化 props；审批命令通过 callback 注入。
- 新组件均使用独立目录、`index.tsx` 与同目录 CSS Module。

### 5.3 帧调度与智能滚动

- frame dispatcher 可归并 message/reasoning/structured/generative delta；遇到非 delta 前按 sequence flush。
- 多个 item 的 delta 同帧到达时保留 item 间先后关系，不能只保存最后一个事件。
- 位于底部阈值内时自动跟随；用户向上滚动后停止抢占并显示“有新内容”。
- 点击入口或滚回底部恢复跟随；切线程/checkpoint 后定位新快照底部。
- 遵守 reduced-motion。

## 6. 错误与一致性

| 条件 | 结果 |
| --- | --- |
| 重复/倒序 sequence | 忽略，不重复投影 |
| 相同类型不同 item ID | 保留多条 |
| delta 目标不存在 | 协议错误，不更新其他条目 |
| tool result 无匹配 call | 创建诊断失败条目，不按工具名猜测 |
| checkpoint state 非 timeline v1 | 返回明确不兼容错误 |
| 活动 SSE 因刷新断开 | flush 部分内容并标记中断，可重试但不续流 |
| A/B 线程并行 | 各自拥有 timeline、sequence、recorder 和流控制器 |
| 终态快照晚到 | 使用服务端同 checkpoint snapshot 校准，不重复条目 |

## 7. 验证与回滚

事件稳定 ID、后端 projector、checkpoint state、timeline API、前端 normalizer/reducer 和组件必须原子交付。数据库迁移删除 messages 后，代码回滚不能恢复旧数据；部署前必须由部署方自行备份。智能滚动和视觉折叠可独立回滚，但不能恢复旧分区渲染。
