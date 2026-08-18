# 前端多会话并行技术设计

## 1. 设计目标

把“当前选中的会话”和“正在运行的会话”解耦。页面只选择一个会话进行展示，但每个会话拥有独立的运行投影和 SSE 控制器；切换展示目标不会改变其他会话的生命周期。

```text
全局共享
├── 当前选中的 thread_id
└── 输入框草稿

按 thread_id 隔离
├── 消息历史与展示项
├── run_id / status / error / sequence
├── reasoning / pending approval
├── 重试请求上下文
└── AbortController
```

后端现有按 `thread_id` 加锁的语义保持不变。本任务不修改 API、数据库或运行状态机。

## 2. 运行状态模型

`useRunStore` 从单一 `RunState` 改为 `Record<threadId, ThreadRunState>`。`ThreadRunState` 继续拥有现有字段，所有写操作显式携带 `threadId`；SSE 事件使用协议中的 `event.thread_id` 选择目标投影。

关键约束：

- 每个会话独立维护 `lastSequence`，A 的 sequence 不影响 B。
- selector 对不存在的会话返回稳定的空投影常量，避免 React 订阅产生无意义更新。
- `beginRun`、`prepareResume`、`setHistory`、`setPendingApproval`、`resetThread` 都只更新目标会话。
- `run.completed` 和 `run.cancelled` 清除侧边栏活动提示；`run.failed` 保留失败提示，直到该会话开始下一次运行、被删除或页面生命周期结束。
- 首次从 `demo-thread` 创建真实会话时，把乐观消息投影迁移到新 `thread_id`，不能重置其他会话。

同一会话的发送、编辑、重新生成和 checkpoint 切换仍由当前会话的活动状态禁用，确保前端不会在一个会话内启动相互竞争的运行。

## 3. SSE 生命周期

`activeStream` 从单一控制器改为按 `thread_id` 保存的控制器注册表：

```ts
activateStream(threadId, controller)
clearActiveStream(threadId, controller)
abortActiveStream(threadId)
abortAllStreams()
```

- 同一会话注册新流时仍中止该会话旧流。
- 不同会话的控制器互不影响。
- 普通运行和审核恢复共用同一注册表，但都必须携带目标 `thread_id`。
- 退出登录或页面卸载时可以统一中止所有流；会话切换不得中止任何流。

事件流固定捕获发起时的 `thread_id`，异步完成后只刷新该会话。任何晚到的请求结果都不得覆盖当前选中会话的 checkpoint、loading 或错误状态。

## 4. 会话加载与切换

`useThreadStore` 增加面向指定会话的刷新能力，替代只能操作“当前会话”的异步流程：

- `setThread` 只切换选中会话并触发其快照加载，不再重置全局运行投影。
- `refreshThread(threadId, preserveRunState)` 总是把历史写入对应运行投影；只有目标仍是当前会话时，才更新界面使用的 checkpoint 列表和当前 checkpoint。
- loading 状态按 `thread_id` 隔离，快速切换时只显示当前目标的加载状态。
- `startNewThread` 仅清理 `demo-thread` 投影，不中止真实会话的活动流。
- 删除终态会话时只清理该会话的投影和控制器引用。

## 5. Chat 与审核恢复

`Chat` 只订阅当前 `thread_id` 对应的运行投影，并据此计算输入框、停止按钮、消息操作和 checkpoint 操作是否可用。

- 输入草稿继续使用一个组件级状态，切换会话后保持原值。
- 发送时先捕获当前 `thread_id`，后续异步逻辑不能重新读取并改投到别的会话。
- 重试请求上下文按 `thread_id` 保存，避免 A 的失败卡片重试 B 的请求。
- 停止操作只中止当前会话控制器，并使用该会话的 `run_id` 调用取消 API。
- `ApprovalCard` 显式接收 `threadId`；审核恢复事件、错误与刷新都回写该会话，即使恢复期间用户已经切走。

## 6. 侧边栏状态与操作

侧边栏直接从运行投影派生状态，不扩展 `ThreadSummary` 或后端 DTO：

| 运行状态 | 侧边栏提示 |
|---|---|
| `queued` / `running` / `resuming` | 运行中 |
| `interrupted` | 等待审核 |
| `failed` | 失败 |
| `idle` / `completed` / `cancelled` | 无提示 |

使用现有语义色 token 和可访问标签。完成状态不产生未读标记。

线程行始终允许导航；活动会话仍允许重命名和置顶，但 Delete 菜单项禁用。非活动会话保持现有操作行为。此规则属于页面交互约束，不新增后端删除 API 合同。

## 7. 兼容与规范更新

- 后端、OpenAPI 和数据库无变更。
- 页面刷新后的运行重连不支持，刷新会结束本页面持有的 SSE。
- 不设置前端并发上限。
- `.trellis/spec/frontend/visual-system.md` 中“全局单一活动流”需要改为“每个会话一个活动流、页面卸载统一清理”，并同步删除当前线程时只中止对应流的约束。

## 8. 风险与控制

- **事件串线**：所有事件由 `event.thread_id` 路由，测试使用相同 sequence 的 A/B 事件验证隔离。
- **异步切换竞态**：快照结果必须检查目标会话，选中态元数据只允许当前请求更新。
- **首次建会话丢失乐观消息**：显式迁移 `demo-thread` 投影，并增加回归测试。
- **错误重试串线**：重试上下文按会话保存并固定目标 ID。
- **停止错杀**：控制器注册表和取消请求都按会话定位，并用双会话测试覆盖。

## 9. 回滚边界

运行 store、流注册表、Chat 调用点和线程切换必须作为一个原子改造交付；只回滚其中一部分会恢复全局状态与按会话调用的不兼容。侧边栏状态样式可以在不改变状态合同的前提下独立回滚。
