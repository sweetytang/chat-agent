# MCP 前端管理体验

## Goal

在独立 `src/modules/mcp/` 中实现普通用户、管理员和对话内 MCP 管理体验，并展示 MCP 工具结果。

## Requirements

- 普通用户：私有/共享 Server、顶级开关、折叠工具列表、独立开关、状态/刷新/错误、个人审计。
- 对话：默认工具集合的临时覆盖与差异提示。
- 工具：原名、描述、来源 Server 可导航标签、风险/未知/不兼容状态、内部名复制。
- 管理员：共享 HTTP/stdio、镜像/沙箱、白名单、审核下限、配额和系统审计。
- 展示 text/structured/image/audio/resource-link 与对象过期状态。
- 所有 DTO 在 MCP 模块统一解码，适配浅/深主题、响应式、键盘和读屏。

## Acceptance Criteria

- [ ] 两级 Switch、卡片/折叠、连接/刷新/错误状态可用且不误导。
- [ ] 普通用户/管理员页面和字段符合权限，越权错误可理解。
- [ ] 对话覆盖不修改用户默认值，运行中变更提示只影响后续 run。
- [ ] 来源定位、风险标签、内部名复制与媒体结果符合父任务要求。
- [ ] lint、type-check、测试、构建和现有聊天 UI 回归通过。

## Dependencies

- 等待 `08-13-mcp-core-host` API/DTO 和 `08-13-mcp-agent-integration` 事件合同稳定。
- 媒体展示依赖 `08-13-mcp-infrastructure` 下载合同。

## Out of Scope

- OAuth、Resources/Prompts/Sampling/Elicitation UI 和容器系统日志对普通用户开放。
