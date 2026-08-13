# MCP 前端管理体验设计

所有 MCP 页面、service、store、types、hooks、domain 和组件位于 `src/modules/mcp/`。Server card 使用 Radix Collapsible 与独立 Switch；状态由后端 DTO 驱动，不在组件推断。

普通用户与管理员共享基础卡片/表单组件，通过明确 capability props 组合，不在 UI 复制权限规则。Chat/App shell 只挂载 MCP 模块公开组件；事件 content blocks 由 MCP decoder 转成展示模型。

组件遵循当前视觉 token、CSS Modules、主题与 `prefers-reduced-motion` 规范。
