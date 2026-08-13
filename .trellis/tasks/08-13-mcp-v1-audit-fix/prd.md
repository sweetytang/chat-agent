# 全面审核并修复 MCP V1

## Goal

对已交付的 MCP V1 做一次可运行、可验证的跨层审核，修复所有阻断核心用户路径、违反既定 V1 合同或造成安全风险的问题，使普通用户可以从前端配置私有 HTTP MCP、启用共享 MCP、发现并启用工具，并让已启用工具真正进入 Agent/HITL 执行链路。

## Confirmed Facts

- `GET /api/mcp/servers` 可稳定复现 500。完整异常为 PostgreSQL `UndefinedObjectError: type "mcp_scope" does not exist`。
- 根因是 `0004_mcp_core` 将角色和 MCP 枚举列创建为 `VARCHAR`，而 ORM 使用具名 PostgreSQL enum，查询参数被转换为 `::mcp_scope`。
- 数据库已处于 `0004_mcp_core`，四张 MCP 表已创建，因此不是漏跑迁移。
- 前端以 `READY` 判断 Server 开启状态，后端状态合同为 `DISABLED/CONNECTING/CONNECTED/DEGRADED/ERROR`。
- 当前 MCP 页面缺少私有 HTTP Server 新建/编辑、连接刷新和可操作错误状态。
- 当前 Agent run 仍使用静态 `default_langchain_tools()`，尚未从数据库解析用户启用 MCP 工具并冻结真实 run 快照。

## Requirements

- 修复 enum 模型与数据库类型漂移，兼容已执行 0004 的现有数据库和全新数据库；用户偏好增加必要唯一约束。
- 普通用户可管理私有 Streamable HTTP Server 并启用共享 Server；共享配置和 stdio 预装只允许管理员。
- 工具列表、开关、连接状态、刷新和错误使用一致 DTO；开关幂等、权限正确、凭据不回传。
- 启用 Server 后由 Host 连接并发现工具，catalog 更新保留偏好；停用或消失工具不进入新 run。
- 用户启用且兼容、存在的工具进入新 run，并按 Mapper 路由；run 冻结 Schema、审核和安全版本。
- MCP 工具默认走 HITL；安全版本变化拒绝旧 interrupt；错误转稳定脱敏业务事件。
- 前端入口、私有 Server 表单、两级开关、来源/风险/兼容标记、复制、刷新和错误重试形成完整闭环。
- 审核 RBAC、SSRF、凭据加密、stdio 沙箱、对象归属和 V1 不支持能力的明确拒绝。

## Acceptance Criteria

- [ ] 现有开发数据库升级后，登录用户访问 `/api/mcp/servers` 返回 200，空数据返回 `[]`。
- [ ] 全新数据库迁移后 ORM enum 查询和写入正常，迁移 upgrade/downgrade 测试通过。
- [ ] 普通用户可创建私有 HTTP Server，不能创建共享/stdio；管理员可创建共享 HTTP/stdio。
- [ ] Server/Tool 开关幂等、持久化且权限正确，刷新页面后状态一致。
- [ ] 启用 Server 能发现工具，工具消失/恢复不丢偏好，连接错误脱敏可重试。
- [ ] 仅启用、存在且兼容的工具进入 Agent，内部名准确路由到远端工具。
- [ ] MCP 调用默认产生 HITL，approve/edit/reject/resume 正常，安全版本变化拒绝旧恢复。
- [ ] text/structured/media/error 结果使用统一事件，媒体经私有对象存储授权访问。
- [ ] stdio 只经受限沙箱编排，普通用户不能修改镜像、命令、网络或挂载。
- [ ] 前端入口、Server 表单、两级开关、标记、复制、刷新和错误态可操作。
- [ ] 后端测试、迁移测试、前端 lint/type/test/build 及关键浏览器流程通过，现有核心功能无回归。

## Out of Scope

- OAuth 2.1、Resources、Prompts、Sampling、Elicitation。
- Kubernetes stdio adapter。
- 非 V1 的管理后台视觉重构。

## Open Questions

无。用户已授权全面审核并自动修复，既有 MCP V1 PRD 是功能范围来源。
