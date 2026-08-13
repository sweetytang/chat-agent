# MCP Agent 与 HITL 集成

## Goal

把已授权 MCP Tools 接入现有 LangGraph/run/HITL/事件/持久化链路，并保证 run 快照与恢复一致性。

## Requirements

- run 创建时解析用户默认与对话覆盖，冻结工具/Mapper/Schema/security version/审核策略。
- 把 snapshot 中 MCP Tools 适配为 LangChain tools，不让 graph 直接依赖 MCP SDK。
- 默认复用现有 interrupt approve/edit/reject/resume；旧安全版本拒绝恢复。
- 复用/扩展统一工具事件，保存来源 Server、content blocks、错误和对象引用。
- 执行前通过核心 Mapper、Schema、启用、presence、配额和审核策略。
- 协议/执行错误转稳定 ToolMessage/业务错误，不影响其他 run。

## Acceptance Criteria

- [ ] 只有用户/对话启用且兼容的工具进入模型。
- [ ] 同名工具路由准确，默认审核与管理员下限生效。
- [ ] 配置中途变化不改变当前 run；安全版本变化会拒绝旧 interrupt。
- [ ] text/structured/media/error 结果通过统一事件持久化和回放。
- [ ] 现有内置工具、聊天、分支、取消和 HITL 无回归。

## Dependencies

- 必须等待 `08-13-mcp-core-host` 的 Mapper、policy、snapshot 与 API 合同稳定。
- 媒体端到端测试依赖 `08-13-mcp-infrastructure` 的 ObjectStorage；可先用 fake port 实现核心逻辑。

## Out of Scope

- MCP 配置 CRUD、Docker/S3 实现与前端页面。
