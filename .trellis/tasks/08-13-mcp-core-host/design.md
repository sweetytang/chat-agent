# MCP 核心管理与协议设计

以后端 `app/modules/mcp/` 为唯一业务所有者，包含 ORM/repository/service/authz/crypto/network policy、Host pool、MCP SDK adapter、Tool Mapper/Schema/policy/snapshot 和 audit。外部模块只使用公开 DTO 与 ports。

数据模型及状态机以父任务 `design.md` 第 3–8、11–12 节为准。MCP SDK 固定在 adapter 中；SSRF 每一跳复核；Client pool key 为 `(user_id, server_id, security_version)`；工具执行前必须经 reverse map、快照、权限、presence、Schema 与 policy 校验。

发布时功能开关默认关闭。迁移只增加角色字段和 MCP 新表，不改变现有 run/消息行为。
