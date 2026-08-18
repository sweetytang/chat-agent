# 统一流式时间线实施计划

## 1. 事件合同与纯投影器

- [x] 为 message segment、reasoning、tool、structured output、Generative UI 补齐稳定 item ID；所有工具路径统一 tool call ID。
- [x] 在后端建立 timeline 类型模块和纯 projector，先用测试锁定交错顺序、同类多条、delta、工具生命周期与失败语义。
- [x] 修改 Runtime 适配器，使“文本 → 工具 → 文本”产生两个 segment ID 和同一个 logical message ID。
- [x] 在前端建立类型化事件 normalizer 与纯 reducer；raw payload 只允许在 normalizer 中读取。

## 2. 删除旧消息模型

- [x] 添加破坏性 Alembic 迁移删除 messages 表及其索引/外键，更新 ORM 和迁移测试。
- [x] 删除 Message/MessageRole、Repository 消息方法、messages/history schemas 和 API。
- [x] 删除 checkpoint `messages` state、message snapshot/project_history_messages 与从 messages 回填标题的逻辑。
- [x] 将模型上下文、最新用户输入、首次问答标题、编辑和重新生成全部改为 timeline 领域投影。

## 3. checkpoint 与持久化服务

- [x] 将 checkpoint state 收敛为带版本的 TimelineSnapshot，并在边界拒绝非 timeline v1 状态。
- [x] 调整分支创建：user checkpoint 后立即创建独立 agent checkpoint；regenerate 创建同级 agent checkpoint。
- [x] 实现 TimelineRecorder，把 BusinessEvent 统一送入 projector，并对 delta 批量 flush、语义边界强制 flush。
- [x] 完成、审批、失败、取消和客户端断开都保存最终/部分快照；断开不续流但提供重试错误。
- [x] 审批恢复继续更新原 checkpoint 和原 ToolItem，不追加重复卡片。

## 4. Timeline API

- [x] 新增 `/threads/{thread_id}/timeline` 严格 DTO，返回当前 checkpoint 的 TimelineSnapshot。
- [x] 为当前分支最后一个可交互条目投影 parent/checkpoint/branch options，覆盖无 assistant 文本分支。
- [x] 前端线程快照加载改用 timeline API，删除 ThreadHistory/HistoryMessage 类型与服务。
- [x] 增加发送、刷新、编辑、重新生成、切分支、审批、失败和所有权集成测试。

## 5. 前端 Store 与领域函数

- [x] 将 ThreadRunState 可见事实收敛为 timeline；删除 history、reasoning、structuredOutput、generativeUi、toolResults、presentationItems。
- [x] `beginRun`、编辑裁剪、重新生成查找、optimistic rollback 和终态校准全部调用 timeline 领域函数。
- [x] 扩展 frame dispatcher，批量处理多类/多 item delta，并在任何非 delta 前保持有序 flush。
- [x] 保持按 thread ID 的 Store、SSE、停止、审批恢复、重试与异步快照隔离。

## 6. 分层组件与交互

- [x] 提取 ChatTimeline，以穷举 typed switch 渲染所有条目；Chat 只负责命令协调和布局。
- [x] 改造 MessageBubble 接收 MessageItem；多个 segment 属于同一逻辑回复，只有终结段显示操作。
- [x] 新增 ReasoningBlock：流式展开、完成后折叠、每段独立。
- [x] 新增 ToolCallCard：调用、审批、执行和结果原地更新；审批动作通过 callback 注入。
- [x] 复用并类型化 StructuredOutputCard、GenerativeUICard、InlineErrorCard，删除底部 fallback 重复渲染。
- [x] 实现智能滚动与“有新内容”入口，覆盖上滚、回底、线程/checkpoint 切换和 reduced-motion。
- [x] 每个新组件使用独立目录和同目录 CSS Module；禁止新增超大页面组件。

## 7. 验证与规范

- [x] 后端测试覆盖 timeline projector、上下文派生、破坏性迁移、分支隔离、recorder flush、审批恢复和断线保存。
- [x] 使用三个独立 ORM Session 回归审批恢复：制造 detached checkpoint、完成 resume、重载并断言 tool/result/assistant 已落库。
- [x] 前端测试覆盖交错事件、同类多条、稳定 key、文本分段、工具生命周期、推理折叠、智能滚动和双线程隔离。
- [x] 运行 backend 目标/全量可行测试，frontend test、type-check、lint、stylelint、format check 与 production build。
- [x] 通过目标回归验证推理 → 文本 → 工具审批/结果 → 文本、刷新中断、分支切换和双线程后台运行。
- [x] 更新前端视觉规范和后端 runtime 规范，明确 timeline 单一事实来源及破坏性数据边界。

## 风险与原子交付点

- 删除 messages 表后不可通过代码回滚恢复数据；迁移仅提交代码，不主动操作外部数据库。
- event IDs、projector、checkpoint state、API DTO 和前端 reducer 必须同批交付。
- checkpoint 创建时机改变会影响 branch parent，必须先补现有分支合同测试。
- recorder 的所有结束路径都必须 flush，否则刷新后会回退内容。
- `Chat`、Store 与 ApprovalCard 的拆分不得破坏刚完成的多线程隔离。
