# 实施计划

1. 记录当前工作区变更，确认不覆盖已有 ToolCallCard 改造。
2. 安装并锁定 `codemirror`、`@uiw/react-codemirror` 及按需语言包，创建支持只读/可编辑模式的 `shared/components/CodeBlock` 及主题样式。
3. 将聊天 Markdown、工具卡片、结构化输出和 MCP JSON 编辑器迁移到全局 CodeBlock，并清理旧组件重复实现。
4. 将 ToolCallCard 的 MCP 专用文案与结果假设改为通用工具语义，补齐通用 JSON/文本/链接回退。
5. 更新 UI 合同测试与 CodeBlock 单元/渲染契约测试，扫描业务只读 `<pre>`/`<code>` 残留。
6. 执行 `pnpm test`、`pnpm exec tsc -p tsconfig.json --noEmit`、ESLint、Stylelint、Prettier 和 Vite build。
7. 进行主题、自动折叠、审核按钮和移动布局回归检查，再提交变更。

## 风险检查点

- 高亮依赖的 bundle 体积和语言注册方式。
- Markdown 行内代码不能被误判为块代码。
- `ToolItem.result` 为 null、字符串、content blocks、错误对象和任意 JSON 时都必须稳定渲染。
- JsonEditor 的 textarea/高亮 overlay 不得被通用只读 CodeBlock 替换。
