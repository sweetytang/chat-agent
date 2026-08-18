# State Management

## 场景：按会话隔离的统一流式时间线

### 1. Scope / Trigger

- 新增或修改消息、推理、工具、审批、结构化输出、Generative UI、错误或分支展示。

### 2. Signatures

```ts
interface TimelineSnapshot {
  version: 1;
  items: TimelineItem[];
}

function normalizeTimelineEvent(event: AgentEvent): TimelineEvent | null;
function reduceTimeline(snapshot: TimelineSnapshot, event: TimelineEvent): TimelineSnapshot;
```

### 3. Contracts

- `ThreadRunState.timeline` 是唯一可见会话状态，不得新增平行 `history`、`reasoning` 或 `presentationItems`。
- Zustand 按 `thread_id` 隔离 timeline、run status、`lastSequence`、pending approval 和 retry context。
- 同 ID delta 原地更新，不同 ID 追加新条目；条目数组顺序是权威展示顺序。
- 加载到的服务端快照不得覆盖活动流；终态才允许用服务端快照校准。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|---|---|
| 重复或倒序 `sequence` | 忽略，不重复投影 |
| delta 缺少稳定 ID | 追加本地错误条目，不猜测“最后一条同类” |
| `run.failed` / `mcp.error` | 将该 run 未完成条目置为 failed，再追加错误条目 |
| 审批恢复 | 先重置该线程 `lastSequence`，继续更新原工具条目 |
| 活动流期间收到快照 | 保留本地时间线 |

### 5. Good / Base / Bad Cases

- Good：文本→工具→文本产生两个文本段和中间的单张工具生命周期卡。
- Base：连续 message delta 在一帧内合并，非 delta 到达前先 flush。
- Bad：`Chat` 把消息列表、推理和卡片分区渲染，或 Store 维护多个可见投影。

### 6. Tests Required

- reducer：交错类型顺序、同类多条、稳定 ID、失败终态。
- conversation 领域函数：多文本段合并、edit/regenerate 裁剪。
- Store：多线程隔离、resume sequence 重置、活动流快照保护。
- 质量门禁：`pnpm test`、`pnpm lint`、`pnpm format:check`、`pnpm build`。

### 7. Wrong vs Correct

```ts
// Wrong: 组件内将不同来源拼成展示顺序
const items = [...history, reasoning, ...presentationItems];

// Correct: 事件边界投影，组件只消费 timeline
const next = reduceTimeline(current.timeline, normalizeTimelineEvent(event));
```
