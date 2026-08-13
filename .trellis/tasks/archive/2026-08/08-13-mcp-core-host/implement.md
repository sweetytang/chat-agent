# MCP 核心管理与协议实施计划

1. 角色与管理员初始化，迁移及 RBAC 测试。
2. definition/activation/tool/preference/snapshot/audit/allowlist/policy 模型与 repository。
3. 凭据 envelope、脱敏 DTO、SSRF/redirect policy。
4. MCP SDK 2.x Streamable HTTP adapter contract tests。
5. Host pool、状态机、刷新、idle eviction、limits/lifespan。
6. Mapper、Schema projector、兼容状态和管理 API。
7. 全量后端 lint、type-check、tests 与迁移验证。

回滚：关闭 MCP 功能开关；新表/字段不影响既有数据；SDK 变更仅回滚 adapter 与 lock。
