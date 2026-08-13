# MCP 核心管理与协议

## Goal

建立 MCP V1 的权限、配置、Streamable HTTP Client、工具目录、Mapper、Schema、状态和审计基座，为 stdio、Agent 与前端提供稳定合同。

## Requirements

- 实现 `USER/ADMIN`、管理员初始化与后端 RBAC。
- 实现私有 HTTP、共享 HTTP/stdio 定义与用户启用关系。
- 实现静态凭据加密/脱敏、SSRF/重定向校验与管理员内网白名单。
- 锁定 MCP Python SDK 2.x，实现 Streamable HTTP adapter、按用户隔离 Client pool、状态机、刷新与配额。
- 实现稳定内部工具名、双向 Mapper、原始 Schema 校验、Provider 兼容投影与 `INCOMPATIBLE`。
- 实现工具偏好、对话覆盖与 run snapshot 所需数据合同，但本子任务不修改 Agent 执行链。
- 实现追加写审计基础、软删除和 security version。

## Acceptance Criteria

- [ ] 私有/共享配置与管理员接口满足所有权和角色约束。
- [ ] 凭据无明文泄漏，SSRF 覆盖解析和重定向。
- [ ] HTTP MCP 可连接、发现、刷新并按用户隔离 Client。
- [ ] 工具内部名稳定唯一，Mapper 双向精确，Schema 不兼容时禁止启用。
- [ ] 状态、配额、软删除、安全版本与审计合同通过测试。

## Dependencies

- 继承父任务 `08-13-mcp-plugin-system` 的 R1–R6、R9、R10、R12。
- 本任务先完成；其他三个 MCP 子任务依赖其 API/DTO/port 稳定。

## Out of Scope

- Docker stdio 实现、S3/MinIO、LangGraph/HITL 集成和前端页面。
