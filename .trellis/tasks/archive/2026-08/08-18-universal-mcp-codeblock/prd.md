# 通用 MCP 工具卡片与全局 CodeBlock 重构

## Goal

让时间线中的工具调用和代码内容使用统一、可复用的展示契约：任何工具调用都显示为通用工具卡片；所有只读代码区块统一使用带主题适配、复制反馈和语言标识的全局 `CodeBlock`。

## Background / Confirmed Facts

- 当前 `ToolCallCard` 位于 `frontend/apps/web/src/modules/timeline/components/ToolCallCard/index.tsx`，标题和结果提示仍写死了 MCP 语义，并直接假设结果为 MCP `content_blocks`。
- 时间线类型已经把调用统一表达为 `ToolItem`，字段为 `tool`、`arguments`、`result`、`status`，因此卡片可以在展示层泛化，不需要修改 SSE 或后端协议。
- 当前已有聊天专用 `CodeBlock`，但工具卡片和结构化输出仍直接渲染 `<pre>`；MCP JSON 编辑器的 `<pre>` 是与 textarea 同步的编辑高亮层，不是只读代码展示。
- 全局主题已提供 `--code-*` 语义变量，前端规范要求代码区块、卡片消费主题 token，不在组件内写主题色。

## Requirements

### R1 通用工具卡片

- 将卡片命名和文案从 MCP 专用语义改为通用“工具调用”；工具名称保留可读化显示，但不依赖 `mcp__` 前缀。
- 参数区支持任意 JSON 值，结果区按通用内容块、链接、文本、错误和 JSON 回退展示；未知结构必须可读且不能导致渲染崩溃。
- 保留现有工具生命周期、审核操作、结果更新、自动折叠和分支控制行为。
- 原始参数和结果必须通过全局 `CodeBlock` 查看，避免大段 JSON 直接撑满卡片。

### R2 全局 CodeBlock

- 选择并引入一个成熟的开源代码高亮组件，封装为 `shared/components/CodeBlock`，由项目统一控制主题、工具栏、复制反馈、语言标签、横向滚动和长内容边界。
- 现有 Markdown fenced code、ToolCallCard 原始 JSON/回退 JSON、StructuredOutputCard JSON 均改用该组件。
- 组件支持无语言标识、`json` 和 Markdown 语言类名；主题切换只依赖全局语义 token。
- MCP JSON 编辑器保留其可编辑高亮层，因为它需要 textarea、行号、活动行和滚动同步；不得为了统一展示组件破坏编辑体验。

## Acceptance Criteria

- [ ] 任意 `ToolItem.tool`（包括非 MCP 名称）均显示为通用工具调用卡片，不出现“仅支持 MCP”的硬编码语义。
- [ ] 工具参数、文本结果、链接结果、错误结果、未知 JSON 结果均有稳定可读的展示；完成态自动折叠、审核态可操作不回归。
- [ ] 源码中除 Markdown 渲染器、CodeBlock 内部和 MCP JSON 编辑器编辑高亮层外，不再存在业务只读 `<pre>`/`<code>` 代码区块。
- [ ] 代码块在浅色/深色主题下可读，支持复制反馈、语言标签、长内容滚动，且不影响 Markdown 行内代码。
- [ ] 前端测试、TypeScript、ESLint、Stylelint、Prettier 和生产构建全部通过。

## Out of Scope

- 不修改 MCP/工具调用的 SSE 协议、上游返回格式或后端持久化结构。
- 不把 MCP JSON 编辑器改造成只读 CodeBlock；仅复用相同的全局主题 token。
- 不在本次任务中新增真实 MCP 结果流式协议。

## Technical Notes

- 代码编辑/展示统一采用 CodeMirror 6 生态，通过 `@uiw/react-codemirror` 封装到 `CodeBlock`；同一个组件以只读或可编辑模式运行，并暴露语言、扩展、行号、折叠、尺寸等配置。
- 卡片结果解析应保持在时间线展示层，不能把原始 SSE payload 解析散落到组件外。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
